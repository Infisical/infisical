import { Knex } from "knex";

import { TableName } from "../schemas";

const BLOCKED_EVENTS_COLUMN = "blockedEvents";

export async function up(knex: Knex): Promise<void> {
  const hasWebhookTable = await knex.schema.hasTable(TableName.Webhook);
  if (!hasWebhookTable) return;

  const hasBlockedEventsColumn = await knex.schema.hasColumn(TableName.Webhook, BLOCKED_EVENTS_COLUMN);

  await knex.schema.alterTable(TableName.Webhook, (table) => {
    if (!hasBlockedEventsColumn) {
      table.specificType(BLOCKED_EVENTS_COLUMN, "text[]").nullable();
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasWebhookTable = await knex.schema.hasTable(TableName.Webhook);
  if (!hasWebhookTable) return;

  const hasBlockedEventsColumn = await knex.schema.hasColumn(TableName.Webhook, BLOCKED_EVENTS_COLUMN);

  await knex.schema.alterTable(TableName.Webhook, (table) => {
    if (hasBlockedEventsColumn) {
      table.dropColumn(BLOCKED_EVENTS_COLUMN);
    }
  });
}
