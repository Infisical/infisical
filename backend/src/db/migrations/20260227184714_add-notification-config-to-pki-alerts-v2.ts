import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.PkiAlertsV2);
  if (hasTable) {
    const hasColumn = await knex.schema.hasColumn(TableName.PkiAlertsV2, "notificationConfig");
    if (!hasColumn) {
      await knex.schema.alterTable(TableName.PkiAlertsV2, (table) => {
        table.jsonb("notificationConfig").nullable().defaultTo(null);
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.PkiAlertsV2);
  if (hasTable) {
    const hasColumn = await knex.schema.hasColumn(TableName.PkiAlertsV2, "notificationConfig");
    if (hasColumn) {
      await knex.schema.alterTable(TableName.PkiAlertsV2, (table) => {
        table.dropColumn("notificationConfig");
      });
    }
  }
}
