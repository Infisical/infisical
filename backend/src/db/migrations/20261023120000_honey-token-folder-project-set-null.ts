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
    t.string("projectId").nullable().alter();
    t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("SET NULL");
  });

  await knex.schema.raw(
    `CREATE INDEX IF NOT EXISTS "${TableName.HoneyToken}_folderid_index" ON "${TableName.HoneyToken}" ("folderId")`
  );
  await knex.schema.raw(
    `CREATE INDEX IF NOT EXISTS "${TableName.HoneyToken}_projectid_index" ON "${TableName.HoneyToken}" ("projectId")`
  );
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.HoneyToken, "folderId"))) return;

  await knex(TableName.HoneyToken)
    .where((qb) => {
      void qb.whereNull("folderId").orWhereNull("projectId");
    })
    .delete();

  await knex.schema.raw(`DROP INDEX IF EXISTS "${TableName.HoneyToken}_folderid_index"`);
  await knex.schema.raw(`DROP INDEX IF EXISTS "${TableName.HoneyToken}_projectid_index"`);

  await knex.schema.alterTable(TableName.HoneyToken, (t) => {
    t.dropForeign(["folderId"]);
    t.dropForeign(["projectId"]);
  });

  await knex.schema.alterTable(TableName.HoneyToken, (t) => {
    t.uuid("folderId").notNullable().alter();
    t.foreign("folderId").references("id").inTable(TableName.SecretFolder).onDelete("CASCADE");
    t.string("projectId").notNullable().alter();
    t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
  });
}
