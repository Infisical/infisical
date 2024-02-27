import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.SuperAdmin, (t) => {
    t.specificType("disabledAuthMethods", "text[]");
  });
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.SuperAdmin, "disableAuthMethods")) {
    await knex.schema.alterTable(TableName.SuperAdmin, (t) => {
      t.dropColumn("disabledAuthMethods");
    });
  }
}
