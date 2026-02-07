/* eslint-disable no-await-in-loop */
import RE2 from "re2";

import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { TSecretReminderRecipientsDALFactory } from "../secret-reminder-recipients/secret-reminder-recipients-dal";
import { TSecretV2BridgeDALFactory } from "../secret-v2-bridge/secret-v2-bridge-dal";
import { TReminderServiceFactory } from "./reminder-types";

type TDailyReminderQueueServiceFactoryDep = {
  reminderService: TReminderServiceFactory;
  queueService: TQueueServiceFactory;
  secretDAL: Pick<TSecretV2BridgeDALFactory, "transaction" | "findSecretsWithReminderRecipientsOld">;
  secretReminderRecipientsDAL: Pick<TSecretReminderRecipientsDALFactory, "delete">;
};

export type TDailyReminderQueueServiceFactory = ReturnType<typeof dailyReminderQueueServiceFactory>;

const uuidRegex = new RE2(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);

export const dailyReminderQueueServiceFactory = ({
  reminderService,
  queueService,
  secretDAL,
  secretReminderRecipientsDAL
}: TDailyReminderQueueServiceFactoryDep) => {
  queueService.start(QueueName.DailyReminders, async () => {
    logger.info(`${QueueName.DailyReminders}: queue task started`);
    await reminderService.sendDailyReminders();
    logger.info(`${QueueName.DailyReminders}: queue task completed`);
  });

  queueService.start(QueueName.SecretReminderMigration, async () => {
    const REMINDER_PRUNE_BATCH_SIZE = 5_000;
    const MAX_RETRY_ON_FAILURE = 3;
    let numberOfRetryOnFailure = 0;
    let deletedReminderCount = 0;

    logger.info(`${QueueName.SecretReminderMigration}: queue task started`);
    try {
      const repeatableJobs = await queueService.getRepeatableJobs(QueueName.SecretReminder);
      const delayedJobs = await queueService.getDelayedJobs(QueueName.SecretReminder);
      logger.info(`${QueueName.SecretReminderMigration}: found ${repeatableJobs.length} secret reminder jobs`);

      const reminderJobs = repeatableJobs
        .map((job) => ({ secretId: job.id?.replace("reminder-", "") as string, jobKey: job.key }))
        .filter(Boolean);
      const reminderDelayedJobs = delayedJobs.reduce((map, job) => {
        const match = uuidRegex.exec(job.repeatJobKey || "");
        if (match) {
          map.set(match[0], {
            timestamp: job.timestamp,
            delay: job.delay,
            data: job.data
          });
        }
        return map;
      }, new Map<string, { timestamp: number; delay: number; data: unknown }>());
      if (reminderJobs.length === 0) {
        logger.info(`${QueueName.SecretReminderMigration}: no reminder jobs found`);
        return;
      }

      for (let offset = 0; offset < reminderJobs.length; offset += REMINDER_PRUNE_BATCH_SIZE) {
        try {
          const batch = reminderJobs.slice(offset, offset + REMINDER_PRUNE_BATCH_SIZE);
          const batchIds = batch.map((job) => job.secretId);

          // Find existing secrets with pagination
          // eslint-disable-next-line no-await-in-loop
          const secrets = await secretDAL.findSecretsWithReminderRecipientsOld(batchIds, REMINDER_PRUNE_BATCH_SIZE);
          const secretsWithReminder = secrets.filter((secret) => secret.reminderRepeatDays);

          const foundSecretIds = new Set(secretsWithReminder.map((secret) => secret.id));

          // Find IDs that don't exist in either table
          const secretIdsNotFound = batchIds.filter((secretId) => !foundSecretIds.has(secretId));

          // Delete reminders for non-existent secrets
          for (const secretId of secretIdsNotFound) {
            const jobKey = reminderJobs.find((r) => r.secretId === secretId)?.jobKey;

            if (jobKey) {
              // eslint-disable-next-line no-await-in-loop
              await queueService.stopRepeatableJobByKey(QueueName.SecretReminder, jobKey);
              deletedReminderCount += 1;
            }
          }

          for (const secretId of foundSecretIds) {
            const jobKey = reminderJobs.find((r) => r.secretId === secretId)?.jobKey;

            if (jobKey) {
              await queueService.stopRepeatableJobByKey(QueueName.SecretReminder, jobKey);
              deletedReminderCount += 1;
            }
          }

          await secretDAL.transaction(async (tx) => {
            await reminderService.batchCreateReminders(
              secretsWithReminder.map((secret) => {
                const delayedJob = reminderDelayedJobs.get(secret.id);
                const projectId = (delayedJob?.data as { projectId?: string })?.projectId;
                const nextDate = delayedJob ? new Date(delayedJob.timestamp + delayedJob.delay) : undefined;
                return {
                  secretId: secret.id,
                  message: secret.reminderNote,
                  repeatDays: secret.reminderRepeatDays,
                  nextReminderDate: nextDate,
                  recipients: secret.recipients || [],
                  projectId
                };
              }),
              tx
            );

            await secretReminderRecipientsDAL.delete({ $in: { secretId: secretsWithReminder.map((s) => s.id) } }, tx);
          });

          numberOfRetryOnFailure = 0;
        } catch (error) {
          numberOfRetryOnFailure += 1;
          logger.error(error, `Failed to process batch at offset ${offset}`);

          if (numberOfRetryOnFailure >= MAX_RETRY_ON_FAILURE) {
            break;
          }

          // Retry the current batch
          offset -= REMINDER_PRUNE_BATCH_SIZE;

          // eslint-disable-next-line no-promise-executor-return, @typescript-eslint/no-loop-func, no-await-in-loop
          await new Promise((resolve) => setTimeout(resolve, 500 * numberOfRetryOnFailure));
        }

        // Small delay between batches
        // eslint-disable-next-line no-promise-executor-return, @typescript-eslint/no-loop-func, no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    } catch (error) {
      logger.error(error, "Failed to complete secret reminder pruning");
    } finally {
      logger.info(
        `${QueueName.SecretReminderMigration}: secret reminders completed. Deleted ${deletedReminderCount} reminders`
      );
    }
  });

  // we do a repeat cron job in utc timezone at 12 Midnight each day
  const startDailyRemindersJob = async () => {
    // clear previous job
    await queueService.stopRepeatableJob(
      QueueName.DailyReminders,
      QueueJobs.DailyReminders,
      { pattern: "0 0 * * *", utc: true },
      QueueName.DailyReminders // just a job id
    );

    await queueService.queue(QueueName.DailyReminders, QueueJobs.DailyReminders, undefined, {
      delay: 5000,
      jobId: QueueName.DailyReminders,
      repeat: { pattern: "0 0 * * *", utc: true, key: QueueJobs.DailyReminders }
    });
  };

  // TODO: remove once all the old reminders in queues are migrated
  const startSecretReminderMigrationJob = async () => {
    // clear previous job
    await queueService.stopRepeatableJob(
      QueueName.SecretReminderMigration,
      QueueJobs.SecretReminderMigration,
      { pattern: "0 */1 * * *", utc: true },
      QueueName.SecretReminderMigration // just a job id
    );
  };

  queueService.listen(QueueName.DailyReminders, "failed", (_, err) => {
    logger.error(err, `${QueueName.DailyReminders}: daily reminder processing failed`);
  });

  queueService.listen(QueueName.SecretReminderMigration, "failed", (_, err) => {
    logger.error(err, `${QueueName.SecretReminderMigration}: secret reminder migration failed`);
  });

  return {
    startDailyRemindersJob,
    startSecretReminderMigrationJob
  };
};
