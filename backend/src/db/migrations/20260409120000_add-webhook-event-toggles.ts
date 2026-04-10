import { Knex } from "knex";

import { TableName } from "../schemas";

const BLOCKED_EVENTS_COLUMN = "blockedEvents";
const SECRET_MODIFIED_EVENT_COLUMN = "isSecretModifiedEventEnabled";
const SECRET_ROTATION_FAILED_EVENT_COLUMN = "isSecretRotationFailedEventEnabled";

export async function up(knex: Knex): Promise<void> {
  const hasWebhookTable = await knex.schema.hasTable(TableName.Webhook);
  if (!hasWebhookTable) return;

  const hasSecretModifiedEventColumn = await knex.schema.hasColumn(TableName.Webhook, SECRET_MODIFIED_EVENT_COLUMN);
  const hasSecretRotationFailedEventColumn = await knex.schema.hasColumn(
    TableName.Webhook,
    SECRET_ROTATION_FAILED_EVENT_COLUMN
  );
  const hasBlockedEventsColumn = await knex.schema.hasColumn(TableName.Webhook, BLOCKED_EVENTS_COLUMN);

  await knex.schema.alterTable(TableName.Webhook, (table) => {
    if (hasSecretModifiedEventColumn) {
      table.dropColumn(SECRET_MODIFIED_EVENT_COLUMN);
    }

    if (hasSecretRotationFailedEventColumn) {
      table.dropColumn(SECRET_ROTATION_FAILED_EVENT_COLUMN);
    }

    if (!hasBlockedEventsColumn) {
      table.specificType(BLOCKED_EVENTS_COLUMN, "text[]").notNullable().defaultTo(knex.raw("'{}'"));
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasWebhookTable = await knex.schema.hasTable(TableName.Webhook);
  if (!hasWebhookTable) return;

  const hasBlockedEventsColumn = await knex.schema.hasColumn(TableName.Webhook, BLOCKED_EVENTS_COLUMN);
  const hasSecretModifiedEventColumn = await knex.schema.hasColumn(TableName.Webhook, SECRET_MODIFIED_EVENT_COLUMN);
  const hasSecretRotationFailedEventColumn = await knex.schema.hasColumn(
    TableName.Webhook,
    SECRET_ROTATION_FAILED_EVENT_COLUMN
  );

  await knex.schema.alterTable(TableName.Webhook, (table) => {
    if (hasBlockedEventsColumn) {
      table.dropColumn(BLOCKED_EVENTS_COLUMN);
    }

    if (!hasSecretModifiedEventColumn) {
      table.boolean(SECRET_MODIFIED_EVENT_COLUMN).notNullable().defaultTo(true);
    }

    if (!hasSecretRotationFailedEventColumn) {
      table.boolean(SECRET_ROTATION_FAILED_EVENT_COLUMN).notNullable().defaultTo(true);
    }
  });
}
