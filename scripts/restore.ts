import { restoreBackup, verifyRestore } from './backup-tools.js';

// Usage: restore.ts <backup-folder> <new-database-name> <new-files-dir>
const [backupDir, dbName, filesDir] = process.argv.slice(2);
if (!backupDir || !dbName || !filesDir) throw new Error('usage: pnpm restore <backup-folder> <new-database-name> <new-files-dir>');
const need = (n: string) => process.env[n] ?? (() => { throw new Error(`${n} is required`); })();
const pw = (n: string) => decodeURIComponent(new URL(need(n)).password);
const { manifest, ownerUrl } = await restoreBackup({
  backupDir,
  adminUrl: need('DATABASE_ADMIN_URL'),
  dbName,
  ownerPassword: pw('DATABASE_OWNER_URL'),
  appPassword: pw('DATABASE_APP_URL'),
  authPassword: pw('DATABASE_AUTH_URL'),
  filesDir,
});
const problems = await verifyRestore(ownerUrl, filesDir, manifest);
if (problems.length) {
  console.error('RESTORE NOT VALID:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(2);
}
console.log(`restored ${dbName} from backup of ${manifest.createdAt}; all checks passed`);
