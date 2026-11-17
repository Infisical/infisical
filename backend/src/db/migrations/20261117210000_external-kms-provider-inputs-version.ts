import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.ExternalKms, "providerInputsVersion"))) {
    // Rows that exist now were saved before AWS external IDs were bound to the organization, so they
    // backfill as version 1. New rows default to 2 so an insert that omits the column gets the strict rules.
    await knex.schema.alterTable(TableName.ExternalKms, (t) => {
      t.integer("providerInputsVersion").notNullable().defaultTo(1);
    });
    await knex.schema.alterTable(TableName.ExternalKms, (t) => {
      t.integer("providerInputsVersion").notNullable().defaultTo(2).alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.ExternalKms, "providerInputsVersion")) {
    await knex.schema.alterTable(TableName.ExternalKms, (t) => {
      t.dropColumn("providerInputsVersion");
    });
  }
}
