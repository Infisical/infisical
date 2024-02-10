import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.Organization, (t) => {
    t.boolean("authEnforced").defaultTo(false);
    t.index("slug");
  });

  await knex.schema.alterTable(TableName.SamlConfig, (t) => {
    t.datetime("lastUsed");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.Organization, (t) => {
    t.dropColumn("authEnforced");
    t.dropIndex("slug");
  });

  await knex.schema.alterTable(TableName.SamlConfig, (t) => {
    t.dropColumn("lastUsed");
  });
}
