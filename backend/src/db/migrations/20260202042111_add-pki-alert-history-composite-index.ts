import { Knex } from "knex";

import { TableName } from "../schemas";

const INDEX_NAME = "pki_alert_history_alert_id_triggered_at_idx";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PkiAlertHistory)) {
    const hasAlertId = await knex.schema.hasColumn(TableName.PkiAlertHistory, "alertId");
    const hasTriggeredAt = await knex.schema.hasColumn(TableName.PkiAlertHistory, "triggeredAt");

    if (hasAlertId && hasTriggeredAt) {
      const indexExists = await knex.raw(`SELECT 1 FROM pg_indexes WHERE indexname = ?`, [INDEX_NAME]);

      if (indexExists.rows.length === 0) {
        await knex.schema.alterTable(TableName.PkiAlertHistory, (t) => {
          t.index(["alertId", "triggeredAt"], INDEX_NAME);
        });
      }
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PkiAlertHistory)) {
    const indexExists = await knex.raw(`SELECT 1 FROM pg_indexes WHERE indexname = ?`, [INDEX_NAME]);

    if (indexExists.rows.length > 0) {
      await knex.schema.alterTable(TableName.PkiAlertHistory, (t) => {
        t.dropIndex(["alertId", "triggeredAt"], INDEX_NAME);
      });
    }
  }
}
