import { seedTenants } from './fixtures.js';

const ownerUrl = process.env.DATABASE_OWNER_URL;
if (!ownerUrl) throw new Error('DATABASE_OWNER_URL is required');
const tenants = await seedTenants(ownerUrl);
for (const [code, t] of Object.entries(tenants)) {
  console.log(`\n${code}: tenant ${t.id}`);
  for (const [b, id] of Object.entries(t.branches)) console.log(`  branch ${b}: ${id}`);
  for (const [k, m] of Object.entries(t.members)) console.log(`  ${k}: Bearer ${m.token}`);
}
