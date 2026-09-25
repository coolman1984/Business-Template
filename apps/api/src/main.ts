import { OpaqueTokenIdentity, createDb } from '@factory/platform-core';
import { buildApp } from './app.js';

const url = process.env.DATABASE_APP_URL;
if (!url) throw new Error('DATABASE_APP_URL is required (the runtime role, never the owner)');
const db = createDb(url);
const app = buildApp({ db, identity: new OpaqueTokenIdentity(db), logger: true });
await app.listen({ host: process.env.HOST ?? '127.0.0.1', port: Number(process.env.PORT ?? 3000) });
