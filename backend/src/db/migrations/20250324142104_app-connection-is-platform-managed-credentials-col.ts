import { Knex } from "knex";

import { TableName } from "@app/db/schemas/models";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.AppConnection, "isPlatformManagedCredentials"))) {
    await knex.schema.alterTable(TableName.AppConnection, (t) => {
      t.boolean("isPlatformManagedCredentials").defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.AppConnection, "isPlatformManagedCredentials")) {
    await knex.schema.alterTable(TableName.AppConnection, (t) => {
      t.dropColumn("isPlatformManagedCredentials");
    });
  }
}
