import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasPitVersionLimitColumn = await knex.schema.hasColumn(TableName.Project, "pitVersionLimit");
  await knex.schema.alterTable(TableName.Project, (tb) => {
    if (!hasPitVersionLimitColumn) {
      tb.integer("pitVersionLimit").notNullable().defaultTo(10);
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasPitVersionLimitColumn = await knex.schema.hasColumn(TableName.Project, "pitVersionLimit");
  await knex.schema.alterTable(TableName.Project, (tb) => {
    if (hasPitVersionLimitColumn) {
      tb.dropColumn("pitVersionLimit");
    }
  });
}
