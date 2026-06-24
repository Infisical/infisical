import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.Project);
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn(TableName.Project, "secretBlindIndexEnabled");
  if (!hasColumn) {
    await knex.schema.alterTable(TableName.Project, (t) => {
      t.boolean("secretBlindIndexEnabled").defaultTo(true).notNullable();
    });

    // Ensure all existing projects are flagged with `secretBlindIndexEnabled: false`
    // New projects already populate the `blindIndex`, so only old projects don't have it enabled
    // by default.
    await knex(TableName.Project).update({ secretBlindIndexEnabled: false });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.Project);
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn(TableName.Project, "secretBlindIndexEnabled");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.Project, (t) => {
      t.dropColumn("secretBlindIndexEnabled");
    });
  }
}
