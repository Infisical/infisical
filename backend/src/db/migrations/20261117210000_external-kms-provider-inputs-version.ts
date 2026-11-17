import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.ExternalKms, "providerInputsVersion"))) {
    // The default stays 1 (legacy): during a rolling deploy, instances still running the previous release insert
    // rows without this column and accept any external ID, so their rows must keep the legacy rules. The current
    // code always writes the version explicitly.
    await knex.schema.alterTable(TableName.ExternalKms, (t) => {
      t.integer("providerInputsVersion").notNullable().defaultTo(1);
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
