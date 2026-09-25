import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SeededMember } from '../scripts/fixtures.js';
import { generateClient, type ClientSpec } from '../scripts/generator.js';
import { createTestApi, createTestDatabase, type TestApi, type TestDatabase } from './helpers.js';

let t: TestDatabase;
let h: TestApi;
const people: Record<string, SeededMember> = {};
const branch: Record<string, string> = {};
const warehouse: Record<string, string> = {};
let screw: { id: string };

const spec: ClientSpec = {
  company: { code: 'repairs', name: 'مركز إصلاح تجريبي' },
  recipe: { code: 'maintenance-center', version: '1.0.0' },
  legalEntity: { code: 'MAIN', name: 'مركز إصلاح ش.م.م' },
  timeZone: 'Africa/Cairo',
  branches: [
    { code: 'NASR', name: 'مدينة نصر' },
    { code: 'ALEX', name: 'الإسكندرية' },
  ],
  warehouses: [
    { code: 'P-NASR', name: 'قطع مدينة نصر', branch: 'NASR' },
    { code: 'P-ALEX', name: 'قطع الإسكندرية', branch: 'ALEX' },
  ],
  administrators: [{ email: 'owner@repairs.example.test', name: 'المدير' }],
  people: [
    { email: 'desk@repairs.example.test', name: 'الاستقبال', role: 'receptionist', branches: ['NASR'] },
    { email: 'tech@repairs.example.test', name: 'الفني', role: 'technician', branches: ['NASR'] },
    { email: 'tech-alex@repairs.example.test', name: 'فني الإسكندرية', role: 'technician', branches: ['ALEX'] },
  ],
};

beforeAll(async () => {
  t = await createTestDatabase();
  h = await createTestApi(t);
  const report = await generateClient({ ownerUrl: t.ownerUrl, appUrl: t.appUrl, spec });
  for (const c of report.credentials) {
    const [m] = await t.ownerQuery<{ id: string }>(
      `SELECT m.id FROM memberships m JOIN users u ON u.id = m.user_id JOIN auth."user" au ON au.id = u.auth_user_id WHERE au.email = $1`,
      [c.email],
    );
    people[c.email.split('@')[0]!] = { membershipId: m!.id, email: c.email, password: c.password };
  }
  for (const b of await t.ownerQuery<{ id: string; code: string }>(`SELECT b.id, b.code FROM branches b JOIN tenants x ON x.id = b.tenant_id WHERE x.code = 'repairs'`)) branch[b.code] = b.id;
  for (const w of await t.ownerQuery<{ id: string; code: string }>(`SELECT w.id, w.code FROM warehouses w JOIN tenants x ON x.id = w.tenant_id WHERE x.code = 'repairs'`)) warehouse[w.code] = w.id;
  screw = (await h.command(people.owner!, 'inventory.item_create', { code: 'SCREEN-15', name: 'شاشة لابتوب ١٥ بوصة', unit: 'قطعة' })).json().result;
  const receipt = (await h.command(people.owner!, 'stock.document_create', { warehouseId: warehouse['P-NASR'], type: 'receipt', lines: [{ itemId: screw.id, quantity: '3' }] })).json().result;
  expect((await h.command(people.owner!, 'stock.document_post', { documentId: receipt.id, expectedVersion: receipt.version })).statusCode).toBe(200);
});

afterAll(async () => {
  await h?.close();
  await t?.drop();
});

async function receive(member = people.desk!, branchCode = 'NASR') {
  const res = await h.command(member, 'service.ticket_create', {
    branchId: branch[branchCode],
    customerName: 'عميل تجريبي',
    customerPhone: '0100 000 0000',
    device: 'لابتوب ديل',
    serialNumber: 'SN-123',
    problem: 'الشاشة مكسورة',
  });
  expect(res.statusCode, res.body).toBe(200);
  return res.json().result as { id: string; ticketNumber: string; version: number };
}

const move = (member: SeededMember, ticket: { id: string; version: number }, to: string, extra: Record<string, string> = {}) =>
  h.command(member, 'service.ticket_transition', { ticketId: ticket.id, expectedVersion: ticket.version, to, ...extra });

async function onHand(code: string): Promise<string> {
  const [row] = await t.ownerQuery<{ on_hand: string }>('SELECT on_hand FROM stock_balances WHERE warehouse_id = $1 AND item_id = $2', [warehouse[code], screw.id]);
  return row ? String(Number(row.on_hand)) : 'none';
}

describe('service tickets', () => {
  it('follows the workflow from reception to delivery, with a history of every step', async () => {
    const ticket = await receive();
    expect(ticket.ticketNumber).toMatch(/^SRV-\d{4}-\d{6}$/);
    let v = ticket.version;
    const step = async (member: SeededMember, to: string, extra: Record<string, string> = {}) => {
      const res = await move(member, { id: ticket.id, version: v }, to, extra);
      expect(res.statusCode, res.body).toBe(200);
      v = res.json().result.version;
    };
    await step(people.tech!, 'diagnosing');
    await step(people.tech!, 'awaiting_approval', { diagnosis: 'الشاشة تحتاج تغيير', note: 'تم إبلاغ العميل بالتكلفة' });
    await step(people.tech!, 'repairing', { note: 'العميل وافق' });
    await step(people.tech!, 'ready');
    await step(people.desk!, 'delivered', { note: 'استلمه العميل' });
    const detail = (await h.get(people.desk!, `/service/tickets/${ticket.id}`)).json();
    expect(detail.status).toBe('delivered');
    expect(detail.diagnosis).toBe('الشاشة تحتاج تغيير');
    expect(detail.events.map((e: { to: string }) => e.to)).toEqual(['received', 'diagnosing', 'awaiting_approval', 'repairing', 'ready', 'delivered']);
    // A delivered ticket is closed.
    expect((await move(people.tech!, { id: ticket.id, version: v }, 'repairing')).json().error).toBe('invalid_transition');
  });

  it('refuses steps outside the workflow and steps the role does not hold', async () => {
    const ticket = await receive();
    const skip = await move(people.tech!, ticket, 'ready');
    expect(skip.statusCode).toBe(409);
    expect(skip.json().details.allowed).toEqual(['diagnosing', 'cancelled']);
    expect((await move(people.desk!, ticket, 'diagnosing')).statusCode).toBe(403);
    expect((await h.command(people.tech!, 'service.ticket_create', { branchId: branch.NASR, customerName: 'x', customerPhone: '0100', device: 'x', problem: 'x' })).statusCode).toBe(403);
    expect((await move(people.owner!, ticket, 'cancelled')).json().details).toMatchObject({ note: expect.any(String) });
    const d = await move(people.tech!, ticket, 'diagnosing');
    const ask = await move(people.tech!, { id: ticket.id, version: d.json().result.version }, 'awaiting_approval');
    expect(ask.statusCode).toBe(400); // a diagnosis first
  });

  it('refuses an invalid status change in the database too', async () => {
    const ticket = await receive();
    await expect(t.ownerWrite(`UPDATE service_tickets SET status = 'delivered' WHERE id = $1`, [ticket.id])).rejects.toThrow(/cannot go from received to delivered/);
    await expect(t.ownerWrite(`DELETE FROM service_ticket_events WHERE ticket_id = $1`, [ticket.id])).rejects.toThrow(/append-only/);
  });

  it('keeps technicians to their branch', async () => {
    const ticket = await receive();
    expect((await h.get(people['tech-alex']!, `/service/tickets/${ticket.id}`)).statusCode).toBe(404);
    expect((await move(people['tech-alex']!, ticket, 'diagnosing')).statusCode).toBe(403);
    const seen = (await h.get(people['tech-alex']!, '/service/tickets')).json().tickets.map((x: { id: string }) => x.id);
    expect(seen).not.toContain(ticket.id);
  });
});

describe('parts through the inventory engine', () => {
  it('takes parts from stock and records them on the ticket in one step', async () => {
    const ticket = await receive();
    const d = (await move(people.tech!, ticket, 'diagnosing')).json().result;
    const res = await h.command(people.tech!, 'service.ticket_use_parts', { ticketId: ticket.id, expectedVersion: d.version, warehouseId: warehouse['P-NASR'], lines: [{ itemId: screw.id, quantity: '1' }] });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().result.stockDocumentNumber).toMatch(/^ISS-/);
    expect(await onHand('P-NASR')).toBe('2');
    const detail = (await h.get(people.tech!, `/service/tickets/${ticket.id}`)).json();
    expect(detail.parts).toHaveLength(1);
    expect(detail.parts[0]).toMatchObject({ number: res.json().result.stockDocumentNumber, status: 'posted', lines: [{ code: 'SCREEN-15', quantity: '1' }] });
    // The stock document names the ticket, so the inventory ledger explains where the part went.
    const [doc] = await t.ownerQuery<{ reference: string }>('SELECT reference FROM stock_documents WHERE document_number = $1', [res.json().result.stockDocumentNumber]);
    expect(doc!.reference).toBe(ticket.ticketNumber);
  });

  it('changes neither stock nor ticket when there are not enough parts', async () => {
    const ticket = await receive();
    const d = (await move(people.tech!, ticket, 'diagnosing')).json().result;
    const before = await onHand('P-NASR');
    const res = await h.command(people.tech!, 'service.ticket_use_parts', { ticketId: ticket.id, expectedVersion: d.version, warehouseId: warehouse['P-NASR'], lines: [{ itemId: screw.id, quantity: '99' }] });
    expect(res.json().error).toBe('insufficient_stock');
    expect(await onHand('P-NASR')).toBe(before);
    expect(await t.ownerQuery('SELECT id FROM service_ticket_parts WHERE ticket_id = $1', [ticket.id])).toEqual([]);
    const [row] = await t.ownerQuery<{ version: number }>('SELECT version FROM service_tickets WHERE id = $1', [ticket.id]);
    expect(row!.version).toBe(d.version);
  });

  it("uses only the ticket branch's warehouses, and only while working on the device", async () => {
    const ticket = await receive();
    const d = (await move(people.tech!, ticket, 'diagnosing')).json().result;
    const other = await h.command(people.tech!, 'service.ticket_use_parts', { ticketId: ticket.id, expectedVersion: d.version, warehouseId: warehouse['P-ALEX'], lines: [{ itemId: screw.id, quantity: '1' }] });
    expect(other.json().error).toBe('other_branch_warehouse');
    const fresh = await receive();
    const early = await h.command(people.tech!, 'service.ticket_use_parts', { ticketId: fresh.id, expectedVersion: fresh.version, warehouseId: warehouse['P-NASR'], lines: [{ itemId: screw.id, quantity: '1' }] });
    expect(early.json().error).toBe('parts_not_allowed');
    // The receptionist cannot take parts at all.
    expect((await h.command(people.desk!, 'service.ticket_use_parts', { ticketId: ticket.id, expectedVersion: d.version, warehouseId: warehouse['P-NASR'], lines: [{ itemId: screw.id, quantity: '1' }] })).statusCode).toBe(403);
  });

  it('attaches photos of the device to the ticket with the shared file engine', async () => {
    const ticket = await receive();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
    const up = await h.upload(people.desk!, `/records/service_tickets/${ticket.id}/files`, png, 'صورة-الجهاز.png', randomUUID());
    expect(up.statusCode, up.body).toBe(200);
    await h.runJobs();
    const files = (await h.get(people.tech!, `/records/service_tickets/${ticket.id}/files`)).json().files;
    expect(files).toHaveLength(1);
    expect(files[0].versions[0].status).toBe('clean');
    expect((await h.get(people['tech-alex']!, `/records/service_tickets/${ticket.id}/files`)).statusCode).toBe(403);
  });
});
