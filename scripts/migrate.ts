import { migrate } from './db-tools.js';

const ownerUrl = process.env.DATABASE_OWNER_URL;
if (!ownerUrl) throw new Error('DATABASE_OWNER_URL is required');
const applied = await migrate(ownerUrl, console.log);
console.log(applied.length ? `done (${applied.length} applied)` : 'up to date');
