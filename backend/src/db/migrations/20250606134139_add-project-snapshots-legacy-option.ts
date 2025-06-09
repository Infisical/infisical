import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasShowSnapshotsLegacyColumn = await knex.schema.hasColumn(TableName.Project, "showSnapshotsLegacy");
  if (!hasShowSnapshotsLegacyColumn) {
    await knex.schema.table(TableName.Project, (table) => {
      table.boolean("showSnapshotsLegacy").notNullable().defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasShowSnapshotsLegacyColumn = await knex.schema.hasColumn(TableName.Project, "showSnapshotsLegacy");
  if (hasShowSnapshotsLegacyColumn) {
    await knex.schema.table(TableName.Project, (table) => {
      table.dropColumn("showSnapshotsLegacy");
    });
  }
}
