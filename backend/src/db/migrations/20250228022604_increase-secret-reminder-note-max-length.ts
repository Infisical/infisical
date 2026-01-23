import { Knex } from "knex";

import { TableName } from "@app/db/schemas/models";

export async function up(knex: Knex): Promise<void> {
  for await (const tableName of [
    TableName.SecretV2,
    TableName.SecretVersionV2,
    TableName.SecretApprovalRequestSecretV2
  ]) {
    const hasReminderNoteCol = await knex.schema.hasColumn(tableName, "reminderNote");

    if (hasReminderNoteCol) {
      await knex.schema.alterTable(tableName, (t) => {
        t.string("reminderNote", 1024).alter();
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  for await (const tableName of [
    TableName.SecretV2,
    TableName.SecretVersionV2,
    TableName.SecretApprovalRequestSecretV2
  ]) {
    const hasReminderNoteCol = await knex.schema.hasColumn(tableName, "reminderNote");

    if (hasReminderNoteCol) {
      await knex.schema.alterTable(tableName, (t) => {
        t.string("reminderNote").alter();
      });
    }
  }
}
