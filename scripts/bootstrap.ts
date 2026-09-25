import { bootstrapDatabase } from './db-tools.js';

const need = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const owner = new URL(need('DATABASE_OWNER_URL'));
const app = new URL(need('DATABASE_APP_URL'));
await bootstrapDatabase({
  adminUrl: need('DATABASE_ADMIN_URL'),
  dbName: owner.pathname.slice(1),
  ownerPassword: decodeURIComponent(owner.password),
  appPassword: decodeURIComponent(app.password),
});
console.log('roles and database ready');
