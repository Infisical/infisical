import { Knex } from "knex";

import { TableName } from "../schemas";

// A cascade would delete the row holding the only pointer to the honey token's IAM user, so the
// row now outlives its folder and the honey token cleanup cron revokes the credentials and reaps it.
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.HoneyToken, "folderId"))) return;

  await knex.schema.alterTable(TableName.HoneyToken, (t) => {
    t.dropForeign(["folderId"]);
  });

  await knex.schema.alterTable(TableName.HoneyToken, (t) => {
    t.uuid("folderId").nullable().alter();
    t.foreign("folderId").references("id").inTable(TableName.SecretFolder).onDelete("SET NULL");
    t.index("folderId");
  });
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.HoneyToken, "folderId"))) return;

  await knex(TableName.HoneyToken).whereNull("folderId").delete();

  await knex.schema.alterTable(TableName.HoneyToken, (t) => {
    t.dropIndex("folderId");
    t.dropForeign(["folderId"]);
  });

  await knex.schema.alterTable(TableName.HoneyToken, (t) => {
    t.uuid("folderId").notNullable().alter();
    t.foreign("folderId").references("id").inTable(TableName.SecretFolder).onDelete("CASCADE");
  });
}
