import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.LdapConfig, "uniqueUserAttribute"))) {
    await knex.schema.alterTable(TableName.LdapConfig, (tb) => {
      tb.string("uniqueUserAttribute").notNullable().defaultTo("");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.LdapConfig, "uniqueUserAttribute")) {
    await knex.schema.alterTable(TableName.LdapConfig, (t) => {
      t.dropColumn("uniqueUserAttribute");
    });
  }
}
