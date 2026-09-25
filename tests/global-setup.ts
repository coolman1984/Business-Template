import { ensureRoles } from '../scripts/db-tools.js';
import { ADMIN_URL, APP_PASSWORD, AUTH_PASSWORD, OWNER_PASSWORD } from './helpers.js';

export default async function setup(): Promise<void> {
  await ensureRoles({ adminUrl: ADMIN_URL, ownerPassword: OWNER_PASSWORD, appPassword: APP_PASSWORD, authPassword: AUTH_PASSWORD });
}
