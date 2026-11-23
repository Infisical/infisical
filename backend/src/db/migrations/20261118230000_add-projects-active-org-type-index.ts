import { Knex } from "knex";

import { TableName } from "../schemas";
import { createIndexConcurrently, withMigrationConnection } from "./utils/concurrent-index";

// countWorkspaces counts an org's live projects by type on every plan fetch and inside the lock on every project
// create. projects_orgid_type_idx has no deleteAfter, so each row needs a heap fetch; this one is index-only.
const INDEX_NAME = "projects_orgid_type_active_idx";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.Project, "deleteAfter"))) return;

  await withMigrationConnection(knex, async (raw) => {
    await createIndexConcurrently(
      raw,
      INDEX_NAME,
      `ON "${TableName.Project}" ("orgId", "type") WHERE "deleteAfter" IS NULL`
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "${INDEX_NAME}"`);
}

const config = { transaction: false };
export { config };
