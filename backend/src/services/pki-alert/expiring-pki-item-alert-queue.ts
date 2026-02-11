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
    // clear previous job
    await queueService.stopRepeatableJob(
      QueueName.DailyExpiringPkiItemAlert,
      QueueJobs.DailyExpiringPkiItemAlert,
      { pattern: "0 0 * * *", utc: true },
      QueueName.DailyExpiringPkiItemAlert // just a job id
    );

    await queueService.queue(QueueName.DailyExpiringPkiItemAlert, QueueJobs.DailyExpiringPkiItemAlert, undefined, {
      delay: 5000,
      jobId: QueueName.DailyExpiringPkiItemAlert,
      repeat: { pattern: "0 0 * * *", utc: true, key: QueueName.DailyExpiringPkiItemAlert }
    });
  };

  queueService.listen(QueueName.DailyExpiringPkiItemAlert, "failed", (_, err) => {
    logger.error(err, `${QueueName.DailyExpiringPkiItemAlert}: Expiring PKI item alert failed`);
  });

  return {
    startSendingAlerts
  };
};
