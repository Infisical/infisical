import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.Organization, "enforceMfa"))) {
    await knex.schema.alterTable(TableName.Organization, (tb) => {
      tb.boolean("enforceMfa").defaultTo(false).notNullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.Organization, "enforceMfa")) {
    await knex.schema.alterTable(TableName.Organization, (t) => {
      t.dropColumn("enforceMfa");
    });
  }
}
