import { Knex } from "knex";

import {
  buildCertificateQuotaKey,
  certificateHasWildcard
} from "@app/services/certificate-common/certificate-quota-key";

import { TableName } from "../schemas";

const BACKFILL_BATCH_SIZE = 10_000;
// Only reached if an instance predating the DAL override is still inserting rows without a key.
// Leftover nulls are tolerable, so this stops rather than failing the deploy.
const MAX_BACKFILL_BATCHES = 10_000;
const ALTER_LOCK_TIMEOUT = 10 * 1000; // fail fast rather than queue behind writes on a hot table

// Columns are nullable on purpose: NOT NULL needs a CHECK added, validated, promoted and dropped,
// three of those taking ACCESS EXCLUSIVE. The DAL's create() supplies the value, and a stray null
// only makes the quota under-count.
//
// config.transaction is false so each batch commits on its own; otherwise knex would hold the
// ADD COLUMN lock for the whole backfill. The transaction below exists solely so SET LOCAL lands on
// the ALTER's connection.
export async function up(knex: Knex): Promise<void> {
  // IF NOT EXISTS per column rather than one hasColumn guard, so a re-run after a partial run adds
  // only what is missing instead of colliding on the column that already landed.
  await knex.transaction(async (tx) => {
    await tx.raw(`SET LOCAL lock_timeout = ${ALTER_LOCK_TIMEOUT}`);
    await tx.raw(
      `ALTER TABLE ?? ADD COLUMN IF NOT EXISTS "quotaKey" varchar(64), ADD COLUMN IF NOT EXISTS "hasWildcard" boolean`,
      [TableName.Certificate]
    );
  });

  // No OFFSET: the WHERE clause is the cursor, since each batch fills the rows it just selected.
  for (let batch = 0; batch < MAX_BACKFILL_BATCHES; batch += 1) {
    // eslint-disable-next-line no-await-in-loop
    const rows = await knex(TableName.Certificate)
      .whereNull("quotaKey")
      .select("id", "commonName", "altNames")
      .limit(BACKFILL_BATCH_SIZE);

    if (!rows.length) break;

    // unnest of arrays, so this takes a fixed number of bind parameters whatever the batch size.
    // eslint-disable-next-line no-await-in-loop
    await knex.raw(
      `UPDATE ?? AS c SET "quotaKey" = u.key, "hasWildcard" = u.wild
       FROM unnest(?::uuid[], ?::text[], ?::boolean[]) AS u(id, key, wild) WHERE c.id = u.id`,
      [
        TableName.Certificate,
        rows.map((row) => row.id),
        rows.map((row) => buildCertificateQuotaKey(row)),
        rows.map((row) => certificateHasWildcard(row))
      ]
    );
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE ?? DROP COLUMN IF EXISTS "quotaKey", DROP COLUMN IF EXISTS "hasWildcard"`, [
    TableName.Certificate
  ]);
}

const config = { transaction: false };
export { config };
