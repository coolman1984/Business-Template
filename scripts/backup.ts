import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createBackup } from './backup-tools.js';

const need = (n: string) => process.env[n] ?? (() => { throw new Error(`${n} is required`); })();
const version = JSON.parse(await readFile(join(import.meta.dirname, '..', 'package.json'), 'utf8')).version ?? '0.0.0';
const { dir, manifest } = await createBackup({
  ownerUrl: need('DATABASE_OWNER_URL'),
  filesDir: need('FILES_DIR'),
  outDir: need('BACKUP_DIR'),
  appVersion: version,
});
console.log(`backup written to ${dir}: ${manifest.files.count} files, ${Object.values(manifest.database.rowCounts).reduce((a, b) => a + b, 0)} rows`);
console.log('Copy this folder to storage outside this machine, and keep the .env secrets separately.');
