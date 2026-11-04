import { Knex } from "knex";

import { TableName } from "../schemas";

// A cascade from the folder would delete the row holding the only pointer to the honey token's IAM user, so
// the row now outlives its folder: the honey token cleanup cron revokes the credentials of a folderless row
// and reaps it. projectId keeps its cascade, since project and org deletion revoke before they delete.
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.HoneyToken, "folderId"))) return;

  await knex.schema.alterTable(TableName.HoneyToken, (t) => {
    t.dropForeign(["folderId"]);
  });

  await knex.schema.alterTable(TableName.HoneyToken, (t) => {
    t.uuid("folderId").nullable().alter();
    t.foreign("folderId").references("id").inTable(TableName.SecretFolder).onDelete("SET NULL");
  });

  await knex.schema.raw(
    `CREATE INDEX IF NOT EXISTS "${TableName.HoneyToken}_folderid_index" ON "${TableName.HoneyToken}" ("folderId")`
  );
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.HoneyToken, "folderId"))) return;

  await knex(TableName.HoneyToken).whereNull("folderId").delete();

  await knex.schema.raw(`DROP INDEX IF EXISTS "${TableName.HoneyToken}_folderid_index"`);

  await knex.schema.alterTable(TableName.HoneyToken, (t) => {
    t.dropForeign(["folderId"]);
  });

  await knex.schema.alterTable(TableName.HoneyToken, (t) => {
    t.uuid("folderId").notNullable().alter();
    t.foreign("folderId").references("id").inTable(TableName.SecretFolder).onDelete("CASCADE");
  });
}
