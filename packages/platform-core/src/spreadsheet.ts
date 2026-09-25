import { inflateRawSync } from 'node:zlib';
import { ValidationError } from './errors.js';

/**
 * Reads the first sheet of an .xlsx workbook or a .csv file into rows of cells. Values are text as
 * written ("0012" stays "0012"); formulas are reported, never evaluated; empty cells are null, not zero.
 * Limits guard against decompression bombs and oversized sheets. No macros, no legacy .xls.
 */
export interface SheetCell {
  readonly value: string | null;
  readonly formula: boolean;
}
export type SheetRow = readonly SheetCell[];

export interface SheetLimits {
  maxRows: number;
  maxColumns: number;
  /** Cap on the uncompressed size of any part of the workbook. */
  maxUnzippedBytes: number;
}
const DEFAULT_LIMITS: SheetLimits = { maxRows: 20_000, maxColumns: 50, maxUnzippedBytes: 50 * 1024 * 1024 };

export class SpreadsheetError extends ValidationError {
  constructor(reason: string) {
    super({ file: reason, reasonCode: reason });
  }
}

export function readSpreadsheet(bytes: Buffer, fileName: string, limits: Partial<SheetLimits> = {}): SheetRow[] {
  const l = { ...DEFAULT_LIMITS, ...limits };
  const lower = fileName.toLowerCase();
  const rows = lower.endsWith('.csv') ? readCsv(bytes) : lower.endsWith('.xlsx') ? readXlsx(bytes, l) : fail('unsupported_file_type');
  if (rows.length > l.maxRows + 1) fail('too_many_rows');
  if (rows.some((r) => r.length > l.maxColumns)) fail('too_many_columns');
  return rows;
}

function fail(reason: string): never {
  throw new SpreadsheetError(reason);
}

// ───────────── CSV ─────────────

function readCsv(bytes: Buffer): SheetRow[] {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail('csv_not_utf8');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  // Arabic Excel often saves CSV with semicolons.
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: SheetCell[][] = [];
  let row: SheetCell[] = [];
  let field = '';
  let quoted = false;
  let wasQuoted = false;
  const endField = () => {
    const v = wasQuoted ? field : field.trim();
    row.push({ value: v === '' && !wasQuoted ? null : v, formula: false });
    field = '';
    wasQuoted = false;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field.trim() === '') {
      quoted = true;
      wasQuoted = true;
      field = '';
    } else if (ch === delimiter) endField();
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endField();
      rows.push(row);
      row = [];
    } else field += ch;
  }
  if (quoted) fail('csv_unclosed_quote');
  if (field !== '' || row.length > 0) {
    endField();
    rows.push(row);
  }
  return rows;
}

// ───────────── XLSX (zip of XML parts) ─────────────

function unzip(bytes: Buffer, maxBytes: number): Map<string, () => Buffer> {
  // End of central directory: signature 0x06054b50 within the last 64 KiB + 22 bytes.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) fail('not_a_workbook');
  const count = bytes.readUInt16LE(eocd + 10);
  let p = bytes.readUInt32LE(eocd + 16);
  const entries = new Map<string, () => Buffer>();
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || bytes.readUInt32LE(p) !== 0x02014b50) fail('not_a_workbook');
    const method = bytes.readUInt16LE(p + 10);
    const compressedSize = bytes.readUInt32LE(p + 20);
    const nameLength = bytes.readUInt16LE(p + 28);
    const extraLength = bytes.readUInt16LE(p + 30);
    const commentLength = bytes.readUInt16LE(p + 32);
    const localOffset = bytes.readUInt32LE(p + 42);
    const name = bytes.subarray(p + 46, p + 46 + nameLength).toString('utf8');
    p += 46 + nameLength + extraLength + commentLength;
    entries.set(name, () => {
      if (localOffset + 30 > bytes.length || bytes.readUInt32LE(localOffset) !== 0x04034b50) fail('not_a_workbook');
      const start = localOffset + 30 + bytes.readUInt16LE(localOffset + 26) + bytes.readUInt16LE(localOffset + 28);
      const data = bytes.subarray(start, start + compressedSize);
      if (method === 0) {
        if (data.length > maxBytes) fail('workbook_too_large');
        return data;
      }
      if (method !== 8) fail('unsupported_compression');
      try {
        return inflateRawSync(data, { maxOutputLength: maxBytes });
      } catch {
        fail('workbook_too_large_or_damaged');
      }
    });
  }
  return entries;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-z]+);/g, (m, e: string) =>
    e.startsWith('#x') ? String.fromCodePoint(parseInt(e.slice(2), 16)) : e.startsWith('#') ? String.fromCodePoint(Number(e.slice(1))) : (ENTITIES[e] ?? m),
  );
}

/** Concatenates every <t> text run inside a fragment (plain and rich-text strings alike). */
function textRuns(fragment: string): string {
  let out = '';
  for (const m of fragment.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)) out += m[1];
  return decodeXml(out);
}

function attr(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
}

function columnIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/)?.[0] ?? 'A';
  let n = 0;
  for (const c of letters) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/** Excel stores 0.3 as 0.29999999999999999 sometimes; keep what the person typed. */
function numberText(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  const rounded = Math.round(n * 1e9) / 1e9;
  return Math.abs(rounded - n) < 1e-9 ? String(rounded) : raw;
}

function readXlsx(bytes: Buffer, l: SheetLimits): SheetRow[] {
  const parts = unzip(bytes, l.maxUnzippedBytes);
  const read = (name: string) => parts.get(name)?.().toString('utf8');
  if ([...parts.keys()].some((k) => k.toLowerCase().endsWith('vbaproject.bin'))) fail('macros_not_allowed');
  const workbook = read('xl/workbook.xml') ?? fail('not_a_workbook');
  const firstSheet = workbook.match(/<(?:\w+:)?sheet\s[^>]*>/)?.[0] ?? fail('no_sheet');
  const relId = attr(firstSheet, 'r:id') ?? fail('no_sheet');
  const rels = read('xl/_rels/workbook.xml.rels') ?? fail('not_a_workbook');
  const rel = [...rels.matchAll(/<Relationship\s[^>]*>/g)].map((m) => m[0]).find((t) => attr(t, 'Id') === relId) ?? fail('no_sheet');
  const target = attr(rel, 'Target')!.replace(/^\/?xl\//, '').replace(/^\//, '');
  const sheet = read(`xl/${target}`) ?? fail('no_sheet');
  const shared = [...(read('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textRuns(m[1]!));

  const rows: SheetCell[][] = [];
  for (const rowMatch of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowNumber = Number(attr(rowMatch[0].slice(0, rowMatch[0].indexOf('>') + 1), 'r') ?? rows.length + 1);
    if (rowNumber > l.maxRows + 1) fail('too_many_rows');
    const cells: SheetCell[] = [];
    for (const c of (rowMatch[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const open = `<c${c[1]}>`;
      const col = columnIndex(attr(open, 'r') ?? '');
      if (col >= l.maxColumns) fail('too_many_columns');
      const body = c[2] ?? '';
      const type = attr(open, 't');
      const formula = /<(?:\w+:)?f[\s>/]/.test(body);
      const v = body.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/)?.[1];
      let value: string | null = null;
      if (type === 's') value = v === undefined ? null : (shared[Number(v)] ?? null);
      else if (type === 'inlineStr') value = textRuns(body);
      else if (type === 'str' || type === 'e') value = v === undefined ? null : decodeXml(v);
      else if (type === 'b') value = v === undefined ? null : v === '1' ? 'TRUE' : 'FALSE';
      else value = v === undefined ? null : numberText(v);
      while (cells.length < col) cells.push({ value: null, formula: false });
      cells[col] = { value: value === '' ? null : value, formula };
    }
    while (rows.length < rowNumber - 1) rows.push([]);
    rows.push(cells);
  }
  return rows;
}
