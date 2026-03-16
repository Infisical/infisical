import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TPkiAlertServiceFactory } from "@app/services/pki-alert/pki-alert-service";

type TDailyExpiringPkiItemAlertQueueServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  pkiAlertService: Pick<TPkiAlertServiceFactory, "sendPkiItemExpiryNotices">;
};

export type TDailyExpiringPkiItemAlertQueueServiceFactory = ReturnType<
  typeof dailyExpiringPkiItemAlertQueueServiceFactory
>;

export const dailyExpiringPkiItemAlertQueueServiceFactory = ({
  queueService,
  pkiAlertService
}: TDailyExpiringPkiItemAlertQueueServiceFactoryDep) => {
  queueService.start(QueueName.DailyExpiringPkiItemAlert, async () => {
    logger.info(`${QueueName.DailyExpiringPkiItemAlert}: queue task started`);
    await pkiAlertService.sendPkiItemExpiryNotices();
    logger.info(`${QueueName.DailyExpiringPkiItemAlert}: queue task completed`);
  });

  // we do a repeat cron job in utc timezone at 12 Midnight each day
  const startSendingAlerts = async () => {
    await queueService.upsertJobScheduler(
      QueueName.DailyExpiringPkiItemAlert,
      QueueName.DailyExpiringPkiItemAlert,
      { pattern: "0 0 * * *" },
      { name: QueueJobs.DailyExpiringPkiItemAlert, opts: { delay: 5000 } }
    );
  };

  queueService.listen(QueueName.DailyExpiringPkiItemAlert, "failed", (_, err) => {
    logger.error(err, `${QueueName.DailyExpiringPkiItemAlert}: Expiring PKI item alert failed`);
  });

  return {
    startSendingAlerts
  };
};
