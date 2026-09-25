// Run: node --test examples/ceramics-demo/data.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './data.js';

const { generate } = globalThis.CeramicData;
const db = generate();

test('generation is deterministic', () => {
  assert.deepEqual(generate(), db);
});

test('headline counts match the plan', () => {
  assert.equal(db.products.length, 40);
  assert.equal(db.dealers.length, 80);
  assert.equal(db.employees.length, 520);
  assert.equal(db.suppliers.length, 30);
  assert.equal(db.warehouses.length, 7);
  assert.equal(db.assets.length, 80);
  assert.equal(db.spareParts.length, 300);
  assert.equal(db.departments.length, 14);
  assert.equal(db.lines.reduce((s, l) => s + l.capacityM2Day, 0), 24000);
});

test('ids are unique in every list', () => {
  for (const key of ['products', 'materials', 'suppliers', 'assets', 'spareParts', 'employees', 'dealers', 'warehouses']) {
    const ids = db[key].map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length, key);
  }
  const codes = db.assets.map((a) => a.code);
  assert.equal(new Set(codes).size, codes.length, 'asset codes');
  const pcodes = db.products.map((p) => p.code);
  assert.equal(new Set(pcodes).size, pcodes.length, 'product codes');
});

test('packing arithmetic holds for every size', () => {
  for (const s of Object.values(db.sizes)) {
    assert.ok(Math.abs(s.pcs * s.w * s.h / 10000 - s.m2Box) < 1e-9, s.id);
  }
});

test('grade prices fall from first to second choice', () => {
  for (const p of db.products) {
    const [g1, g2, g3] = p.prices.map((x) => x.perM2);
    assert.ok(g1 > g2 && g2 > g3, p.code);
    assert.ok(p.stdCostPerM2 < g3, `${p.code} cost must stay under the lowest grade price`);
  }
});

test('recipes add up to 100% and use known materials', () => {
  const materialIds = new Set(db.materials.map((m) => m.id));
  for (const r of [...db.recipes.body, ...db.recipes.glaze]) {
    assert.equal(r.lines.reduce((s, l) => s + l[1], 0), 100, r.id);
    for (const [id] of r.lines) assert.ok(materialIds.has(id), `${r.id} uses ${id}`);
  }
  const recipeIds = new Set([...db.recipes.body, ...db.recipes.glaze].map((r) => r.id));
  for (const p of db.products) {
    assert.ok(recipeIds.has(p.bodyRecipe) && recipeIds.has(p.glazeRecipe), p.code);
  }
});

test('every reference points at something that exists', () => {
  const supplierIds = new Set(db.suppliers.map((s) => s.id));
  const whIds = new Set(db.warehouses.map((w) => w.id));
  const empIds = new Set(db.employees.map((e) => e.id));
  const assetTypes = new Set(db.assets.map((a) => a.type));
  for (const m of db.materials) {
    if (m.supplierId) assert.ok(supplierIds.has(m.supplierId), m.id);
    assert.ok(whIds.has(m.warehouseId), m.id);
  }
  for (const p of db.spareParts) {
    assert.ok(supplierIds.has(p.supplierId), p.id);
    assert.ok(p.assetType === '*' || assetTypes.has(p.assetType), p.id);
  }
  for (const d of db.dealers) {
    if (d.type !== 'export' || d.repId) assert.ok(empIds.has(d.repId), d.id);
  }
  for (const w of db.warehouses) assert.ok(empIds.has(w.keeperId), w.id);
});

test('departments are staffed exactly and each has one head', () => {
  for (const d of db.departments) {
    const staff = db.employees.filter((e) => e.departmentId === d.id);
    assert.equal(staff.length, d.headcount, d.id);
    assert.ok(staff.some((e) => e.level === 'manager'), d.id);
  }
  assert.equal(db.reps.length, 8);
});

test('the demo storyline hooks exist', () => {
  assert.ok(db.dealers.some((d) => d.status === 'creditHold'));
  assert.ok(db.products.some((p) => p.status === 'new'));
  assert.ok(db.products.some((p) => p.status === 'discontinued'));
  assert.ok(db.assets.some((a) => a.status === 'maintenance'));
  assert.ok(db.spareParts.some((p) => p.onHand < p.minStock));
});

test('executives are managers, and only the secretary is not', () => {
  for (const e of db.employees.filter((x) => x.departmentId === 'D01')) {
    assert.equal(e.level, e.title.en === 'Executive secretary' ? 'professional' : 'manager', e.title.en);
  }
});

test('payment method follows payment terms', () => {
  for (const d of db.dealers) {
    if (d.type === 'export') assert.equal(d.paymentMethod.en, 'Letter of credit', d.id);
    else assert.equal(d.paymentMethod.en, d.paymentTermsDays === 0 ? 'Cash' : 'Credit', d.id);
  }
});

test('every unit used has a label in both languages', () => {
  for (const x of [...db.materials, ...db.spareParts]) {
    assert.ok(db.units[x.unit] && db.units[x.unit].ar && db.units[x.unit].en, `${x.id} uses unit ${x.unit}`);
  }
});

test('meter-based maintenance has a sane last-service reading', () => {
  const metered = db.assets.filter((a) => a.meter != null);
  assert.ok(metered.length > 0);
  for (const a of metered) assert.ok(a.meterAtLastPm >= 0 && a.meterAtLastPm <= a.meter, a.code);
  assert.ok(metered.some((a) => a.meter >= a.meterAtLastPm + a.pmInterval), 'at least one metered service is due');
  assert.ok(metered.some((a) => a.meter < a.meterAtLastPm + a.pmInterval), 'at least one metered service is not yet due');
});

test('shift reports, lots and downtime reference real lines, products and staff', () => {
  const lineIds = new Set(db.lines.map((l) => l.id));
  const productIds = new Set(db.products.map((p) => p.id));
  const empIds = new Set(db.employees.map((e) => e.id));
  for (const s of db.shiftReports) {
    assert.ok(lineIds.has(s.line) && productIds.has(s.productId) && empIds.has(s.supervisorId), s.id);
    assert.ok(s.kilnOutM2 <= s.kilnInM2 && s.kilnInM2 <= s.pressedM2, s.id);
    assert.ok(s.firstM2 + s.commercialM2 + s.secondM2 <= s.kilnOutM2 + 1, s.id);
  }
  for (const e of db.downtimeEvents) assert.ok(lineIds.has(e.line) && db.codes.downtime.some((c) => c.id === e.codeId), e.id);
});

test('sorting lots never allocate more than they hold', () => {
  assert.ok(db.sortingLots.length > 0);
  for (const l of db.sortingLots) assert.ok(l.reservedM2 + l.dispatchedM2 <= l.m2 + 1e-6, l.id);
});

test('sales orders, dispatch loads and purchase orders reference real records', () => {
  const lotIds = new Set(db.sortingLots.map((l) => l.id));
  const dealerIds = new Set(db.dealers.map((d) => d.id));
  const orderIds = new Set(db.salesOrders.map((o) => o.id));
  const empIds = new Set(db.employees.map((e) => e.id));
  const materialIds = new Set(db.materials.map((m) => m.id));
  const partIds = new Set(db.spareParts.map((p) => p.id));
  const supplierIds = new Set(db.suppliers.map((s) => s.id));
  const assetIds = new Set(db.assets.map((a) => a.id));
  for (const o of db.salesOrders) {
    assert.ok(dealerIds.has(o.dealerId), o.id);
    for (const l of o.lines) assert.ok(lotIds.has(l.lotId), o.id);
  }
  for (const d of db.dispatchLoads) {
    assert.ok(empIds.has(d.driverId), d.id);
    for (const id of d.orderIds) assert.ok(orderIds.has(id), d.id);
  }
  for (const p of db.purchaseOrders) {
    assert.ok(supplierIds.has(p.supplierId), p.id);
    assert.ok(p.itemType === 'material' ? materialIds.has(p.itemId) : partIds.has(p.itemId), p.id);
  }
  for (const w of db.workOrders) assert.ok(assetIds.has(w.assetId) && empIds.has(w.by), w.id);
});

test('the L1 maintenance week and L2 shade incident show up in the shift data', () => {
  const l1 = db.shiftReports.filter((s) => s.line === 'L1' && s.date >= db.incidents.l1MaintFrom && s.date <= db.incidents.l1MaintTo);
  assert.equal(l1.length, 0, 'no output while kiln 1 is stripped down');
  const rate = (rows) => rows.reduce((sum, s) => sum + s.firstM2 / (s.kilnOutM2 || 1), 0) / rows.length;
  const before = db.shiftReports.filter((s) => s.line === 'L2' && s.date < db.incidents.l2IssueFrom);
  const during = db.shiftReports.filter((s) => s.line === 'L2' && s.date >= db.incidents.l2IssueFrom && s.date <= db.incidents.l2IssueTo);
  const after = db.shiftReports.filter((s) => s.line === 'L2' && s.date > db.incidents.l2IssueTo);
  assert.ok(rate(during) < rate(before) - 0.05, 'first-choice yield visibly drops during the burner issue');
  assert.ok(rate(after) > rate(during) + 0.05, 'yield recovers afterwards');
});

test('lab test values respect their pass/fail spec', () => {
  const byId = Object.fromEntries(db.codes.tests.map((q) => [q.id, q]));
  for (const t of db.labTests.filter((t) => t.stage === 'finished')) {
    const spec = byId[t.testCodeId].spec[t.family];
    if (!spec) continue;
    const inRange = (spec[0] == null || t.value >= spec[0]) && (spec[1] == null || t.value <= spec[1]);
    assert.equal(t.pass, inRange, `${t.id} ${t.testCodeId}`);
  }
});
