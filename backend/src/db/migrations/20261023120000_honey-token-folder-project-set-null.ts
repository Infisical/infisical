import { Knex } from "knex";

import { TableName } from "../schemas";

// A cascade would delete the row holding the only pointer to the honey token's IAM user, so the row now
// outlives its folder and project: the honey token cleanup cron revokes the credentials of a folderless row
// and reaps it, and reports one whose project was deleted before it could be revoked.
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.HoneyToken, "folderId"))) return;

  await knex.schema.alterTable(TableName.HoneyToken, (t) => {
    t.dropForeign(["folderId"]);
    t.dropForeign(["projectId"]);
  });

  await knex.schema.alterTable(TableName.HoneyToken, (t) => {
    t.uuid("folderId").nullable().alter();
    t.foreign("folderId").references("id").inTable(TableName.SecretFolder).onDelete("SET NULL");
    t.index("folderId");
    t.string("projectId").nullable().alter();
    t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("SET NULL");
    t.index("projectId");
  });
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.HoneyToken, "folderId"))) return;

  await knex(TableName.HoneyToken)
    .where((qb) => {
      void qb.whereNull("folderId").orWhereNull("projectId");
    })
    .delete();

  await knex.schema.alterTable(TableName.HoneyToken, (t) => {
    t.dropIndex("folderId");
    t.dropForeign(["folderId"]);
    t.dropIndex("projectId");
    t.dropForeign(["projectId"]);
  });

  await knex.schema.alterTable(TableName.HoneyToken, (t) => {
    t.uuid("folderId").notNullable().alter();
    t.foreign("folderId").references("id").inTable(TableName.SecretFolder).onDelete("CASCADE");
    t.string("projectId").notNullable().alter();
    t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
  });
}
