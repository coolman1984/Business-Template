/**
 * Amounts travel as decimal strings with at most two decimals and are added as integer cents, so no
 * sum is ever rounded by floating point.
 */
export const MONEY_PATTERN = '^(0|[1-9][0-9]{0,14})(\\.[0-9]{1,2})?$';
const MONEY_RE = /^-?(\d+)(?:\.(\d{1,2}))?$/;

export function toCents(value: string | number): bigint {
  const text = String(value).trim();
  const m = MONEY_RE.exec(text);
  if (!m) throw new Error(`not an amount: ${text}`);
  const cents = BigInt(m[1]!) * 100n + BigInt((m[2] ?? '').padEnd(2, '0'));
  return text.startsWith('-') ? -cents : cents;
}

export function fromCents(cents: bigint): string {
  const sign = cents < 0n ? '-' : '';
  const abs = cents < 0n ? -cents : cents;
  return `${sign}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}

/** Canonical form of an amount ("12.5" → "12.50"). */
export const normalizeMoney = (value: string | number) => fromCents(toCents(value));
