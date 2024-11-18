import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.OidcConfig, "lastUsed"))) {
    await knex.schema.alterTable(TableName.OidcConfig, (tb) => {
      tb.datetime("lastUsed");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.OidcConfig, "lastUsed")) {
    await knex.schema.alterTable(TableName.OidcConfig, (tb) => {
      tb.dropColumn("lastUsed");
    });
  }
}
