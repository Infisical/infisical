import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";

import { TReminderServiceFactory } from "./reminder-types";

type TDailyReminderQueueServiceFactoryDep = {
  reminderService: TReminderServiceFactory;
  cronJob: TCronJobFactory;
};

export type TDailyReminderQueueServiceFactory = ReturnType<typeof dailyReminderQueueServiceFactory>;

export const dailyReminderQueueServiceFactory = ({
  reminderService,
  cronJob
}: TDailyReminderQueueServiceFactoryDep) => {
  const startDailyRemindersJob = () => {
    cronJob.register({
      name: CronJobName.DailyReminders,
      pattern: "0 0 * * *",
      runHashTtlS: 3 * 24 * 60 * 60,
      handler: async () => {
        logger.info("cron[daily-reminders]: task started");
        await reminderService.dispatchDueReminders();
        try {
          await reminderService.reapOrphanedReminderAlerts();
        } catch (error) {
          logger.error(error, "cron[daily-reminders]: failed to reap orphaned reminder alerts");
        }
      }
    });
  };

  return {
    startDailyRemindersJob
  };
};
