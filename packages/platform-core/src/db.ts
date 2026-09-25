import { Kysely, PostgresDialect, type Transaction } from 'kysely';
import pg from 'pg';
import type { Database } from './schema.js';

export type Db = Kysely<Database>;
export type Tx = Transaction<Database>;

export function createDb(connectionString: string, poolSize = 10): Db {
  const pool = new pg.Pool({ connectionString, max: poolSize });
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}
