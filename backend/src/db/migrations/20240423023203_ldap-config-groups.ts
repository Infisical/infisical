import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.LdapConfig, (t) => {
    t.string("groupSearchBase").notNullable().defaultTo("");
    t.string("groupSearchFilter").notNullable().defaultTo("");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.LdapConfig, (t) => {
    t.dropColumn("groupSearchBase");
    t.dropColumn("groupSearchFilter");
  });
}
