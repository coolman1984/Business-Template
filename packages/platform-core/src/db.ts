import { Kysely, PostgresDialect, type Transaction } from 'kysely';
import pg from 'pg';
import type { Database } from './schema.js';

// A calendar date (accounting dates) stays the 'YYYY-MM-DD' text PostgreSQL sends. The driver's
// default turns it into a Date at local midnight, which shifts the day in time zones west of UTC.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

export type Db = Kysely<Database>;
export type Tx = Transaction<Database>;

export function createDb(connectionString: string, poolSize = 10): Db {
  const pool = new pg.Pool({ connectionString, max: poolSize });
  // An idle connection dropped by the server (restart, failover) must not crash the process;
  // the pool discards it and opens a new one on the next query.
  pool.on('error', (error) => console.warn(`database connection lost: ${error.message}`));
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}
