import { readFile } from 'node:fs/promises';
import { GeneratorError, generateClient } from './generator.js';

// Usage: pnpm generate:client <definition.json> [--dry-run] [--upgrade]
// Needs DATABASE_OWNER_URL (provisioning) and DATABASE_APP_URL (engine commands).
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('usage: pnpm generate:client <definition.json> [--dry-run] [--upgrade]');
  process.exit(2);
}
const need = (name: string) => process.env[name] ?? (console.error(`${name} is required`), process.exit(2));
try {
  const report = await generateClient({
    ownerUrl: need('DATABASE_OWNER_URL'),
    appUrl: need('DATABASE_APP_URL'),
    spec: JSON.parse(await readFile(file, 'utf8')),
    dryRun: args.includes('--dry-run'),
    upgrade: args.includes('--upgrade'),
  });
  console.log(`${report.dryRun ? 'Preview (nothing written)' : 'Done'} — mode: ${report.mode}${report.runId ? `, run ${report.runId}` : ''}`);
  for (const s of report.steps) console.log(`  ${s.outcome.padEnd(13)} ${s.step} ${s.key}${s.detail ? ` (${s.detail})` : ''}`);
  for (const r of report.readiness) console.log(`  ${r.ok ? '✔' : '✖'} ${r.check}${r.detail ? `: ${r.detail}` : ''}`);
  if (report.credentials.length) {
    console.log('\nOne-time sign-in details (shown once, not stored; ask the person to change the password):');
    for (const c of report.credentials) console.log(`  ${c.email}  /  ${c.password}`);
  }
  process.exit(report.readiness.every((r) => r.ok) ? 0 : 1);
} catch (error) {
  console.error(error instanceof GeneratorError ? error.message : error);
  process.exit(1);
}
