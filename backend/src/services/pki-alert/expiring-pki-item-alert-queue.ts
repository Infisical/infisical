import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";
import { TPkiAlertServiceFactory } from "@app/services/pki-alert/pki-alert-service";

type TDailyExpiringPkiItemAlertQueueServiceFactoryDep = {
  cronJob: TCronJobFactory;
  pkiAlertService: Pick<TPkiAlertServiceFactory, "sendPkiItemExpiryNotices">;
};

export type TDailyExpiringPkiItemAlertQueueServiceFactory = ReturnType<
  typeof dailyExpiringPkiItemAlertQueueServiceFactory
>;

export const dailyExpiringPkiItemAlertQueueServiceFactory = ({
  cronJob,
  pkiAlertService
}: TDailyExpiringPkiItemAlertQueueServiceFactoryDep) => {
  const startSendingAlerts = () => {
    cronJob.register({
      name: CronJobName.DailyExpiringPkiItemAlert,
      pattern: "0 0 * * *",
      runHashTtlS: 3 * 24 * 60 * 60,
      handler: async () => {
        logger.info("cron[daily-expiring-pki-item-alert]: task started");
        await pkiAlertService.sendPkiItemExpiryNotices();
      }
    });
  };

  return {
    startSendingAlerts
  };
};
