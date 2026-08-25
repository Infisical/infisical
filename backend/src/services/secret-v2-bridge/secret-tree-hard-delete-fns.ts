import { Knex } from "knex";

import { TableName } from "@app/db/schemas";

// Chunked pre-cascade prune of the secret tree, shared by the project and environment hard-delete
// workers. Both delete the same tables in the same order and differ only in how the folder set is
// scoped, so the scope arrives as a subquery builder.
//
// Each batch is its own transaction: a statement timeout or a crash leaves fewer rows for the next
// attempt instead of rolling back the whole delete, which is what makes these resumable. The
// statement_timeout is SET LOCAL so it can't leak to pooled connections.

export type TFolderIdsSubquery = (tx: Knex) => Knex.QueryBuilder;

export type TSecretTreePruneOpts = {
  batchSize: number;
  statementTimeoutMs: number;
  interBatchSleepMs: number;
};

export const projectFolderIdsSubquery =
  (projectId: string): TFolderIdsSubquery =>
  (tx) =>
    tx(TableName.SecretFolder)
      .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
      .where(`${TableName.Environment}.projectId`, projectId)
      .select(`${TableName.SecretFolder}.id`);

export const envFolderIdsSubquery =
  (envId: string): TFolderIdsSubquery =>
  (tx) =>
    tx(TableName.SecretFolder).where("envId", envId).select("id");

const runPruneBatches = async (
  db: Knex,
  { batchSize, statementTimeoutMs, interBatchSleepMs }: TSecretTreePruneOpts,
  runBatch: (tx: Knex) => Promise<number>
) => {
  let totalAffected = 0;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const affected = await db.transaction(async (tx): Promise<number> => {
      await tx.raw(`SET LOCAL statement_timeout = ${statementTimeoutMs}`);
      const count = await runBatch(tx);
      return count;
    });
    totalAffected += affected;
    if (affected < batchSize) break;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      setTimeout(resolve, interBatchSleepMs + Math.floor(Math.random() * interBatchSleepMs));
    });
  }
  return totalAffected;
};

export const hardDeleteSecretVersionsInBatches = (
  db: Knex,
  folderIds: TFolderIdsSubquery,
  opts: TSecretTreePruneOpts
) =>
  runPruneBatches(db, opts, async (tx) => {
    const idsToDelete = tx(TableName.SecretVersionV2)
      .whereIn("folderId", folderIds(tx))
      .select("id")
      .limit(opts.batchSize);
    const deleted = await tx(TableName.SecretVersionV2).whereIn("id", idsToDelete).delete();
    return deleted;
  });

export const hardDeleteSecretReferencesInBatches = (
  db: Knex,
  folderIds: TFolderIdsSubquery,
  opts: TSecretTreePruneOpts
) =>
  runPruneBatches(db, opts, async (tx) => {
    const secretIdsSubquery = tx(TableName.SecretV2).whereIn("folderId", folderIds(tx)).select("id");
    const idsToDelete = tx(TableName.SecretReferenceV2)
      .whereIn("secretId", secretIdsSubquery)
      .select("id")
      .limit(opts.batchSize);
    const deleted = await tx(TableName.SecretReferenceV2).whereIn("id", idsToDelete).delete();
    return deleted;
  });

export const hardDeleteApprovalSecretLinksInBatches = (
  db: Knex,
  folderIds: TFolderIdsSubquery,
  opts: TSecretTreePruneOpts
) =>
  runPruneBatches(db, opts, async (tx) => {
    const secretIdsSubquery = tx(TableName.SecretV2).whereIn("folderId", folderIds(tx)).select("id");
    const idsToNull = tx(TableName.SecretApprovalRequestSecretV2)
      .whereIn("secretId", secretIdsSubquery)
      .select("id")
      .limit(opts.batchSize);
    const nulled = await tx(TableName.SecretApprovalRequestSecretV2)
      .whereIn("id", idsToNull)
      .update({ secretId: null });
    return nulled;
  });

// Must run after the reference and approval-link prunes; deleting secrets first would drag those two cascades back into one statement.
// (Secret versions must also be pruned first, but for orphaning, not cascade timing.)
export const hardDeleteSecretsInBatches = (db: Knex, folderIds: TFolderIdsSubquery, opts: TSecretTreePruneOpts) =>
  runPruneBatches(db, opts, async (tx) => {
    const batch = await tx(TableName.SecretV2).whereIn("folderId", folderIds(tx)).select("id").limit(opts.batchSize);
    if (!batch.length) return 0;
    const secretIds = batch.map(({ id }) => id);
    // secret_rotation_v2_secret_mappings.secretId is a deferred NO ACTION FK: it blocks deleting a
    // secret on its own, but allows it when the mapping goes in the same transaction. The rotation
    // rows are reaped later by the folder cascade.
    await tx(TableName.SecretRotationV2SecretMapping).whereIn("secretId", secretIds).delete();
    const deleted = await tx(TableName.SecretV2).whereIn("id", secretIds).delete();
    return deleted;
  });
