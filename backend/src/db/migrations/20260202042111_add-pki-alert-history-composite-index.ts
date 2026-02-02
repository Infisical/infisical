import { Knex } from "knex";

import { TableName } from "../schemas";

const INDEX_NAME = "pki_alert_history_alert_id_triggered_at_idx";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PkiAlertHistory)) {
    const hasAlertId = await knex.schema.hasColumn(TableName.PkiAlertHistory, "alertId");
    const hasTriggeredAt = await knex.schema.hasColumn(TableName.PkiAlertHistory, "triggeredAt");

    if (hasAlertId && hasTriggeredAt) {
      await knex.schema.alterTable(TableName.PkiAlertHistory, (t) => {
        t.index(["alertId", "triggeredAt"], INDEX_NAME);
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PkiAlertHistory)) {
    await knex.schema.alterTable(TableName.PkiAlertHistory, (t) => {
      t.dropIndex(["alertId", "triggeredAt"], INDEX_NAME);
    });
  }
}
