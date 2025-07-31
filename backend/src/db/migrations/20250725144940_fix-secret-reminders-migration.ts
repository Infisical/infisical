/* eslint-disable no-await-in-loop */
import { Knex } from "knex";

import { chunkArray } from "@app/lib/fn";
import { logger } from "@app/lib/logger";

import { TableName } from "../schemas";
import { TReminders, TRemindersInsert } from "../schemas/reminders";

export async function up(knex: Knex): Promise<void> {
  logger.info("Initializing secret reminders migration");
  const hasReminderTable = await knex.schema.hasTable(TableName.Reminder);

  if (hasReminderTable) {
    const secretsWithLatestVersions = await knex(TableName.SecretV2)
      .whereNotNull(`${TableName.SecretV2}.reminderRepeatDays`)
      .whereRaw(`"${TableName.SecretV2}"."reminderRepeatDays" > 0`)
      .innerJoin(TableName.SecretVersionV2, (qb) => {
        void qb
          .on(`${TableName.SecretVersionV2}.secretId`, "=", `${TableName.SecretV2}.id`)
          .andOn(`${TableName.SecretVersionV2}.reminderRepeatDays`, "=", `${TableName.SecretV2}.reminderRepeatDays`);
      })
      .whereIn([`${TableName.SecretVersionV2}.secretId`, `${TableName.SecretVersionV2}.version`], (qb) => {
        void qb
          .select(["v2.secretId", knex.raw("MIN(v2.version) as version")])
          .from(`${TableName.SecretVersionV2} as v2`)
          .innerJoin(`${TableName.SecretV2} as s2`, "v2.secretId", "s2.id")
          .whereRaw(`v2."reminderRepeatDays" = s2."reminderRepeatDays"`)
          .whereNotNull("v2.reminderRepeatDays")
          .whereRaw(`v2."reminderRepeatDays" > 0`)
          .groupBy("v2.secretId");
      })
      // Add LEFT JOIN with Reminder table to check for existing reminders
      .leftJoin(TableName.Reminder, `${TableName.Reminder}.secretId`, `${TableName.SecretV2}.id`)
      // Only include secrets that don't already have reminders
      .whereNull(`${TableName.Reminder}.secretId`)
      .select(
        knex.ref("id").withSchema(TableName.SecretV2).as("secretId"),
        knex.ref("reminderRepeatDays").withSchema(TableName.SecretV2).as("reminderRepeatDays"),
        knex.ref("reminderNote").withSchema(TableName.SecretV2).as("reminderNote"),
        knex.ref("createdAt").withSchema(TableName.SecretVersionV2).as("createdAt")
      );

    logger.info(`Found ${secretsWithLatestVersions.length} reminders to migrate`);

    const reminderInserts: TRemindersInsert[] = [];
    if (secretsWithLatestVersions.length > 0) {
      secretsWithLatestVersions.forEach((secret) => {
        if (!secret.reminderRepeatDays) return;

        const now = new Date();
        const createdAt = new Date(secret.createdAt);
        let nextReminderDate = new Date(createdAt);
        nextReminderDate.setDate(nextReminderDate.getDate() + secret.reminderRepeatDays);

        // If the next reminder date is in the past, calculate the proper next occurrence
        if (nextReminderDate < now) {
          const daysSinceCreation = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
          const daysIntoCurrentCycle = daysSinceCreation % secret.reminderRepeatDays;
          const daysUntilNextReminder = secret.reminderRepeatDays - daysIntoCurrentCycle;

          nextReminderDate = new Date(now);
          nextReminderDate.setDate(now.getDate() + daysUntilNextReminder);
        }

        reminderInserts.push({
          secretId: secret.secretId,
          message: secret.reminderNote,
          repeatDays: secret.reminderRepeatDays,
          nextReminderDate
        });
      });

      const commitBatches = chunkArray(reminderInserts, 2000);
      for (const commitBatch of commitBatches) {
        const insertedReminders = (await knex
          .batchInsert(TableName.Reminder, commitBatch)
          .returning("*")) as TReminders[];

        const insertedReminderSecretIds = insertedReminders.map((reminder) => reminder.secretId).filter(Boolean);

        const recipients = await knex(TableName.SecretReminderRecipients)
          .whereRaw(`??.?? IN (${insertedReminderSecretIds.map(() => "?").join(",")})`, [
            TableName.SecretReminderRecipients,
            "secretId",
            ...insertedReminderSecretIds
          ])
          .select(
            knex.ref("userId").withSchema(TableName.SecretReminderRecipients).as("userId"),
            knex.ref("secretId").withSchema(TableName.SecretReminderRecipients).as("secretId")
          );
        const reminderRecipients = recipients.map((recipient) => ({
          reminderId: insertedReminders.find((reminder) => reminder.secretId === recipient.secretId)?.id,
          userId: recipient.userId
        }));

        const filteredRecipients = reminderRecipients.filter((recipient) => Boolean(recipient.reminderId));
        await knex.batchInsert(TableName.ReminderRecipient, filteredRecipients);
      }
      logger.info(`Successfully migrated ${reminderInserts.length} secret reminders`);
    }

    logger.info("Secret reminders migration completed");
  } else {
    logger.warn("Reminder table does not exist, skipping migration");
  }
}

export async function down(): Promise<void> {
  logger.info("Rollback not implemented for secret reminders fix migration");
}
