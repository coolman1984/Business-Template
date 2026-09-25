import { join } from 'node:path';
import { createDb } from '@factory/platform-core';
import { buildApp } from './app.js';
import { LibraryIdentity, createAuth } from './auth.js';

const need = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const publicUrl = process.env.PUBLIC_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`;
// Runtime role only: never the owner or a superuser.
const db = createDb(need('DATABASE_APP_URL'));
const { auth } = createAuth({ databaseUrl: need('DATABASE_AUTH_URL'), secret: need('AUTH_SECRET'), publicUrl });
const webRoot = process.env.WEB_ROOT ?? join(import.meta.dirname, '..', '..', 'business-web', 'dist');
const app = buildApp({ db, identity: new LibraryIdentity(auth), authHandler: auth.handler, publicUrl, webRoot, logger: true });
await app.listen({ host: process.env.HOST ?? '127.0.0.1', port: Number(process.env.PORT ?? 3000) });
