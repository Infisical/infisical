import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { TAlertDALFactory } from "./alert-dal";
import { TAlertEngine } from "./alert-engine";
import { TAlertProviderRegistry } from "./alert-provider-registry";

type TAlertQueueServiceFactoryDep = {
  cronJob: TCronJobFactory;
  queueService: TQueueServiceFactory;
  alertDAL: Pick<TAlertDALFactory, "findEnabledByResourceType" | "findActiveById">;
  alertProviderRegistry: TAlertProviderRegistry;
  alertEngine: Pick<TAlertEngine, "runAlert">;
};

export type TAlertQueueServiceFactory = ReturnType<typeof alertQueueServiceFactory>;

const ALERT_DISPATCH_CONCURRENCY = 5;

export const alertQueueServiceFactory = ({
  cronJob,
  queueService,
  alertDAL,
  alertProviderRegistry,
  alertEngine
}: TAlertQueueServiceFactoryDep) => {
  const appCfg = getConfig();

  const enqueueDueAlerts = async () => {
    for (const resourceType of alertProviderRegistry.resourceTypes()) {
      // eslint-disable-next-line no-await-in-loop
      const alerts = await alertDAL.findEnabledByResourceType(resourceType);
      // eslint-disable-next-line no-await-in-loop
      await Promise.all(
        alerts.map((alert) =>
          queueService.queue(
            QueueName.AlertDispatch,
            QueueJobs.AlertDispatch,
            { alertId: alert.id },
            {
              jobId: `alert-dispatch-${alert.id}`,
              removeOnComplete: true,
              removeOnFail: true,
              attempts: 1
            }
          )
        )
      );
    }
  };

  const init = () => {
    queueService.start(
      QueueName.AlertDispatch,
      async (job) => {
        const { alertId } = job.data;
        const alert = await alertDAL.findActiveById(alertId);
        if (!alert || !alert.enabled) return;
        await alertEngine.runAlert(alert);
      },
      { concurrency: ALERT_DISPATCH_CONCURRENCY }
    );

    cronJob.register({
      name: CronJobName.DailyAlertProcessing,
      pattern: appCfg.isDevelopmentMode ? "*/5 * * * *" : "0 0 * * *",
      runHashTtlS: 60 * 60 * 24,
      enabled: !appCfg.isSecondaryInstance,
      handler: async () => {
        logger.info("cron[daily-alert-processing]: enqueueing due alerts");
        await enqueueDueAlerts();
        logger.info("cron[daily-alert-processing]: enqueue complete");
      }
    });
  };

  return { init, enqueueDueAlerts };
};
