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
