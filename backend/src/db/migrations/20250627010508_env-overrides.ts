import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.SuperAdmin, "encryptedEnvOverrides");
  if (!hasColumn) {
    await knex.schema.alterTable(TableName.SuperAdmin, (t) => {
      t.binary("encryptedEnvOverrides").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.SuperAdmin, "encryptedEnvOverrides");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.SuperAdmin, (t) => {
      t.dropColumn("encryptedEnvOverrides");
    });
  }
}
