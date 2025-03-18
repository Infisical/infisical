import { Knex } from "knex";

import { TableName } from "@app/db/schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.AppConnection, "isPlatformManaged"))) {
    await knex.schema.alterTable(TableName.AppConnection, (t) => {
      t.boolean("isPlatformManaged").defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.AppConnection, "isPlatformManaged")) {
    await knex.schema.alterTable(TableName.AppConnection, (t) => {
      t.dropColumn("isPlatformManaged");
    });
  }
}
