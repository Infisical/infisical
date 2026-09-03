import { Knex } from "knex";

import { buildCertificateQuotaKey } from "@app/services/certificate-common/certificate-quota-key";

import { TableName } from "../schemas";

const BACKFILL_BATCH_SIZE = 10_000;
// Only reached if an instance predating the DAL override is still inserting rows without a key.
// Leftover nulls are tolerable, so this stops rather than failing the deploy.
const MAX_BACKFILL_BATCHES = 10_000;

// Nullable on purpose: NOT NULL needs a CHECK added, validated, promoted and dropped, three of those
// taking ACCESS EXCLUSIVE. The DAL's create() supplies the value, and a stray null only makes the
// quota under-count. A follow-up migration can add NOT NULL once every instance is on the new code.
//
// config.transaction is false so each batch commits on its own; otherwise knex would hold the
// ADD COLUMN lock for the whole backfill.
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.Certificate, "quotaKey"))) {
    // While an ACCESS EXCLUSIVE lock is waiting, every query arriving after it queues behind it, reads
    // included, so the wait is bounded. The transaction exists only so SET LOCAL lands on the same
    // pooled connection as the ALTER.
    await knex.transaction(async (tx) => {
      await tx.raw("SET LOCAL lock_timeout = '5s'");
      await tx.schema.alterTable(TableName.Certificate, (t) => {
        t.string("quotaKey", 64).nullable();
      });
    });
  }

  // No OFFSET: the WHERE clause is the cursor, since each batch fills the rows it just selected.
  for (let batch = 0; batch < MAX_BACKFILL_BATCHES; batch += 1) {
    // eslint-disable-next-line no-await-in-loop
    const rows = await knex(TableName.Certificate)
      .whereNull("quotaKey")
      .select("id", "commonName", "altNames")
      .limit(BACKFILL_BATCH_SIZE);

    if (!rows.length) break;

    // unnest of two arrays, so this takes two bind parameters whatever the batch size.
    // eslint-disable-next-line no-await-in-loop
    await knex.raw(
      `UPDATE ?? AS c SET "quotaKey" = u.key FROM unnest(?::uuid[], ?::text[]) AS u(id, key) WHERE c.id = u.id`,
      [TableName.Certificate, rows.map((row) => row.id), rows.map((row) => buildCertificateQuotaKey(row))]
    );
  }
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.Certificate, "quotaKey"))) return;

  await knex.schema.alterTable(TableName.Certificate, (t) => {
    t.dropColumn("quotaKey");
  });
}

const config = { transaction: false };
export { config };
