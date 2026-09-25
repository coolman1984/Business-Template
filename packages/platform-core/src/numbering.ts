import { sql } from 'kysely';
import type { Tx } from './db.js';

/**
 * Issues the next business number for a legal entity, document type and year. The upsert locks the
 * sequence row until commit, so numbers are gapless among committed documents and never reused.
 */
export async function nextDocumentNumber(
  trx: Tx,
  args: { tenantId: string; legalEntityId: string; documentType: string; year: number },
): Promise<bigint> {
  const row = await trx
    .insertInto('document_sequences')
    .values({
      tenant_id: args.tenantId,
      legal_entity_id: args.legalEntityId,
      document_type: args.documentType,
      year: args.year,
      last_value: 1,
    })
    .onConflict((oc) =>
      oc.columns(['tenant_id', 'legal_entity_id', 'document_type', 'year']).doUpdateSet({
        last_value: sql`document_sequences.last_value + 1`,
      }),
    )
    .returning('last_value')
    .executeTakeFirstOrThrow();
  return BigInt(row.last_value);
}
