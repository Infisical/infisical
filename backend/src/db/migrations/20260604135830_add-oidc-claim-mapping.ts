import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.OidcConfig, "claimEmailPath"))) {
    await knex.schema.alterTable(TableName.OidcConfig, (t) => {
      t.string("claimEmailPath", 255).nullable();
      t.string("claimNamePath", 255).nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.OidcConfig, "claimEmailPath")) {
    await knex.schema.alterTable(TableName.OidcConfig, (t) => {
      t.dropColumn("claimEmailPath");
      t.dropColumn("claimNamePath");
    });
  }
}
