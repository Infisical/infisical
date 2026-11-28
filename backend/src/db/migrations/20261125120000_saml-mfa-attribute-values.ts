import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.SamlConfig, "mfaAttributeValues"))) {
    await knex.schema.alterTable(TableName.SamlConfig, (t) => {
      t.specificType("mfaAttributeValues", "text[]").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.SamlConfig, "mfaAttributeValues")) {
    await knex.schema.alterTable(TableName.SamlConfig, (t) => {
      t.dropColumn("mfaAttributeValues");
    });
  }
}
