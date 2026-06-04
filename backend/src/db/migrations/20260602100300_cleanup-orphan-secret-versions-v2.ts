import { Knex } from "knex";

import { TableName } from "../schemas";

// One-off cleanup of ORPHANED secret_versions_v2 rows. secret_versions_v2 has no FK on folderId
// (only a mostly-NULL envId cascade), so the OLD synchronous project-delete path left version rows
// behind with folderId pointing at folders that were cascade-deleted. The daily pruneExcessVersions
// job can't reach them (its INNER JOINs folder→env→project drop orphans), so they accumulate as dead
// weight that also bloats scans of this table. New deletions no longer orphan (the cleanup queue
// prunes versions by folderId first), so this is a one-time reclaim.
//
// Batched (one short autocommitted DELETE per iteration, statement_timeout-bounded) so it never takes
// one giant lock / WAL spike. Idempotent: if the migration is re-run after a partial failure it simply
// continues deleting whatever orphans remain.
const BATCH_SIZE = 20_000;
const BATCH_STATEMENT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes per batch

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.SecretVersionV2))) return;

  const stmtResult = await knex.raw("SHOW statement_timeout");
  const originalStatementTimeout = stmtResult.rows[0].statement_timeout;

  try {
    await knex.raw(`SET statement_timeout = ${BATCH_STATEMENT_TIMEOUT_MS}`);

    for (;;) {
      const idsToDelete = knex(TableName.SecretVersionV2)
        .whereNotExists((qb) => {
          void qb
            .select(knex.raw("1"))
            .from(TableName.SecretFolder)
            .whereRaw(`"${TableName.SecretFolder}".id = "${TableName.SecretVersionV2}"."folderId"`);
        })
        .select("id")
        .limit(BATCH_SIZE);

      // eslint-disable-next-line no-await-in-loop
      const deleted = await knex(TableName.SecretVersionV2).whereIn("id", idsToDelete).delete();
      if (deleted < BATCH_SIZE) break;
    }
  } finally {
    await knex.raw(`SET statement_timeout = '${originalStatementTimeout}'`);
  }
}

// Irreversible by design — deleted orphan rows cannot be reconstructed.
export async function down(): Promise<void> {}

const config = { transaction: false };
export { config };
