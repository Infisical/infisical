import { Knex } from "knex";

import { TableName } from "../schemas";

const FILTERED_EVENTS_COLUMN = "filteredEvents";

export async function up(knex: Knex): Promise<void> {
  const hasWebhookTable = await knex.schema.hasTable(TableName.Webhook);
  if (!hasWebhookTable) return;

  const hasFilteredEventsColumn = await knex.schema.hasColumn(TableName.Webhook, FILTERED_EVENTS_COLUMN);

  await knex.schema.alterTable(TableName.Webhook, (table) => {
    if (!hasFilteredEventsColumn) {
      table.specificType(FILTERED_EVENTS_COLUMN, "text[]").nullable();
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasWebhookTable = await knex.schema.hasTable(TableName.Webhook);
  if (!hasWebhookTable) return;

  const hasFilteredEventsColumn = await knex.schema.hasColumn(TableName.Webhook, FILTERED_EVENTS_COLUMN);

  await knex.schema.alterTable(TableName.Webhook, (table) => {
    if (hasFilteredEventsColumn) {
      table.dropColumn(FILTERED_EVENTS_COLUMN);
    }
  });
}
