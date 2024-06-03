import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.Organization, (t) => {
    t.string("billingVersion").defaultTo("v1");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.Organization, (t) => {
    t.dropColumn("billingVersion");
  });
}
