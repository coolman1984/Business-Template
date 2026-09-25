/**
 * One-command local development: a private PostgreSQL inside `.local/`, the API with its job worker,
 * and the web UI with live reload. Synthetic demo companies are seeded on first run only.
 * Development only; production uses compose.yaml with a real PostgreSQL server.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { bootstrapDatabase, migrate } from './db-tools.js';
import { seedTenants, syncRoleTemplates } from './fixtures.js';

const root = join(import.meta.dirname, '..');
const stateDir = join(root, '.local');
const PG_PORT = Number(process.env.LOCAL_PG_PORT ?? 54329);
const API_PORT = Number(process.env.LOCAL_API_PORT ?? 3000);
const WEB_PORT = Number(process.env.LOCAL_WEB_PORT ?? 5173);
const webUrl = `http://127.0.0.1:${WEB_PORT}`;
const require = createRequire(import.meta.url);

interface LocalConfig {
  adminPassword: string;
  ownerPassword: string;
  appPassword: string;
  authPassword: string;
  authSecret: string;
}

const secret = () => randomBytes(24).toString('base64url');

async function loadConfig(): Promise<LocalConfig> {
  const file = join(stateDir, 'config.json');
  if (existsSync(file)) return JSON.parse(await readFile(file, 'utf8'));
  const config = { adminPassword: secret(), ownerPassword: secret(), appPassword: secret(), authPassword: secret(), authSecret: secret() };
  await writeFile(file, JSON.stringify(config, null, 2), { mode: 0o600 });
  return config;
}

const children: ChildProcess[] = [];
function run(name: string, args: string[], env: NodeJS.ProcessEnv): ChildProcess {
  const child = spawn(process.execPath, args, { cwd: root, env: { ...process.env, ...env }, stdio: 'inherit' });
  child.on('exit', (code) => {
    if (!stopping) {
      console.error(`\n✖ ${name} stopped (exit ${code}). Shutting down.`);
      void stop(1);
    }
  });
  children.push(child);
  return child;
}

async function waitFor(url: string, seconds: number): Promise<void> {
  for (let i = 0; i < seconds * 4; i++) {
    try {
      if ((await fetch(url)).status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${url} did not start within ${seconds}s`);
}

function openBrowser(url: string): void {
  const [cmd, args] =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
}

let stopping = false;
let pg: EmbeddedPostgres | null = null;
async function stop(code = 0): Promise<never> {
  stopping = true;
  for (const c of children) c.kill();
  await pg?.stop().catch(() => {});
  process.exit(code);
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());

async function main(): Promise<void> {
  await mkdir(stateDir, { recursive: true });
  const config = await loadConfig();
  const dataDir = join(stateDir, 'pg');
  const fresh = !existsSync(join(dataDir, 'PG_VERSION'));

  console.log('▶ Starting local database…');
  pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: config.adminPassword,
    port: PG_PORT,
    persistent: true,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    // PostgreSQL refuses to run as root (some Linux containers); the library then uses a service user.
    createPostgresUser: process.getuid?.() === 0,
    onLog: () => {},
  });
  if (fresh) await pg.initialise();
  await pg.start();

  const url = (user: string, password: string, db: string) => `postgres://${user}:${encodeURIComponent(password)}@127.0.0.1:${PG_PORT}/${db}`;
  const adminUrl = url('postgres', config.adminPassword, 'postgres');
  const ownerUrl = url('factory_owner', config.ownerPassword, 'factory');
  await bootstrapDatabase({ adminUrl, dbName: 'factory', ownerPassword: config.ownerPassword, appPassword: config.appPassword, authPassword: config.authPassword });
  const applied = await migrate(ownerUrl);
  if (applied.length) console.log(`  applied ${applied.length} migration(s)`);

  const loginsFile = join(stateDir, 'demo-logins.txt');
  if (existsSync(loginsFile)) {
    const added = await syncRoleTemplates(ownerUrl);
    if (added) console.log(`  gave the demo roles ${added} new permission(s) from this version`);
  } else {
    console.log('▶ Creating synthetic demo companies…');
    const tenants = await seedTenants(ownerUrl);
    const lines = ['Demo sign-ins (synthetic data, local only)', ''];
    for (const [code, t] of Object.entries(tenants)) {
      lines.push(`[${code}]`);
      for (const [key, m] of Object.entries(t.members)) lines.push(`  ${key.padEnd(12)} ${m.email}  /  ${m.password}`);
      lines.push('');
    }
    await writeFile(loginsFile, lines.join('\n'), { mode: 0o600 });
  }

  console.log('▶ Starting API and web UI…');
  run('API', [require.resolve('tsx/cli'), 'apps/api/src/main.ts'], {
    DATABASE_APP_URL: url('factory_app', config.appPassword, 'factory'),
    DATABASE_AUTH_URL: url('factory_auth', config.authPassword, 'factory'),
    AUTH_SECRET: config.authSecret,
    // The browser talks to the web dev server, which forwards API calls; cookies and origin checks follow it.
    PUBLIC_URL: webUrl,
    PORT: String(API_PORT),
    FILES_DIR: join(stateDir, 'files'),
    WEB_ROOT: join(stateDir, 'no-static'), // the dev server serves the UI with live reload
  });
  run('web UI', [join(dirname(require.resolve('vite/package.json')), 'bin', 'vite.js'), 'apps/business-web', '--host', '127.0.0.1', '--port', String(WEB_PORT), '--strictPort'], {
    VITE_API_TARGET: `http://127.0.0.1:${API_PORT}`,
  });
  await waitFor(`http://127.0.0.1:${API_PORT}/health`, 60);
  await waitFor(webUrl, 60);

  console.log(`\n✔ Ready: ${webUrl}\n`);
  console.log(await readFile(loginsFile, 'utf8'));
  console.log('Edit files under apps/business-web/src and the page reloads by itself.');
  console.log('Press Ctrl+C (or close this window) to stop.\n');
  openBrowser(webUrl);
}

main().catch((error) => {
  console.error('\n✖ Could not start:', error);
  void stop(1);
});
