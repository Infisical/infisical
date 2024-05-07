import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.LdapConfig, (t) => {
    t.string("searchFilter").notNullable().defaultTo("");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.LdapConfig, (t) => {
    t.dropColumn("searchFilter");
  });
}
