import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.SuperAdmin, "enabledLoginMethods"))) {
    await knex.schema.alterTable(TableName.SuperAdmin, (tb) => {
      tb.specificType("enabledLoginMethods", "text[]");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.SuperAdmin, "enabledLoginMethods")) {
    await knex.schema.alterTable(TableName.SuperAdmin, (t) => {
      t.dropColumn("enabledLoginMethods");
    });
  }
}
