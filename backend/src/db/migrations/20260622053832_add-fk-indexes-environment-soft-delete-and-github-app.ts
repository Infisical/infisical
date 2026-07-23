import { Knex } from "knex";

import { TableName } from "../schemas";

// Three nullable foreign-key columns shipped without covering indexes, so the per-row
// referential-integrity trigger on the parent delete seq-scans the child table.
//
// - project_environments.deletedByUserId  (SET NULL → users)
// - project_environments.deletedByIdentityId  (SET NULL → identities)
//   Both are NULL on the live path and only set when an env is soft-deleted, so they get
//   partial indexes over the non-NULL rows.
//
// - github_apps.projectId  (CASCADE → projects)
//   Org-level apps have projectId=NULL, project-level apps have it set. The unique composite
//   on (orgId, projectId, name) does not cover a lookup by projectId alone because projectId
//   is not the leftmost column, so deleting a project seq-scans github_apps today.
const FK_INDEXES = [
  {
    table: TableName.Environment,
    column: "deletedByUserId",
    name: "project_environments_deleted_by_user_id_idx"
  },
  {
    table: TableName.Environment,
    column: "deletedByIdentityId",
    name: "project_environments_deleted_by_identity_id_idx"
  },
  {
    table: TableName.GitHubApp,
    column: "projectId",
    name: "github_apps_project_id_idx"
  }
];

const indexExists = async (knex: Knex, indexName: string): Promise<boolean> => {
  const result = await knex.raw(`SELECT 1 FROM pg_indexes WHERE indexname = ?`, [indexName]);
  return result.rows.length > 0;
};

export async function up(knex: Knex): Promise<void> {
  for await (const idx of FK_INDEXES) {
    if (
      (await knex.schema.hasTable(idx.table)) &&
      (await knex.schema.hasColumn(idx.table, idx.column)) &&
      !(await indexExists(knex, idx.name))
    ) {
      await knex.schema.alterTable(idx.table, (t) => {
        t.index([idx.column], idx.name, { predicate: knex.whereNotNull(idx.column) });
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  for await (const idx of FK_INDEXES) {
    if ((await knex.schema.hasTable(idx.table)) && (await indexExists(knex, idx.name))) {
      await knex.schema.alterTable(idx.table, (t) => {
        t.dropIndex([idx.column], idx.name);
      });
    }
  }
}
