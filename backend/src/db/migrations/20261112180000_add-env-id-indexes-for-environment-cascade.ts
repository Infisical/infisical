import { Knex } from "knex";

import { TableName } from "../schemas";
import { createIndexConcurrently, withMigrationConnection } from "./utils/concurrent-index";

// Deleting an environment (and so a project or an org) cascades into these tables by "envId". Without
// an index each cascade is a sequential scan of a very large table, which pushes org deletion past the
// statement timeout.
const INDEXES = [
  { table: TableName.Snapshot, name: "idx_secret_snapshots_env_id" },
  { table: TableName.SnapshotFolder, name: "idx_secret_snapshot_folders_env_id" },
  { table: TableName.SecretFolderVersion, name: "idx_secret_folder_versions_env_id" }
];

export async function up(knex: Knex): Promise<void> {
  const present: typeof INDEXES = [];
  for (const index of INDEXES) {
    // eslint-disable-next-line no-await-in-loop
    if (await knex.schema.hasColumn(index.table, "envId")) present.push(index);
  }

  await withMigrationConnection(knex, async (raw) => {
    for (const { table, name } of present) {
      // eslint-disable-next-line no-await-in-loop
      await createIndexConcurrently(raw, name, `ON "${table}" ("envId")`);
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  for (const { name } of INDEXES) {
    // eslint-disable-next-line no-await-in-loop
    await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "${name}"`);
  }
}

const config = { transaction: false };
export { config };
