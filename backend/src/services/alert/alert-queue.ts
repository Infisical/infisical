import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";
import { AlertDispatchOutcome, recordAlertDispatchOutcomeMetric } from "@app/lib/telemetry/metrics";
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

const ALERT_DISPATCH_CONCURRENCY = 5;

export const alertQueueServiceFactory = ({
  cronJob,
  queueService,
  alertDAL,
  alertProviderRegistry,
  alertEngine
}: TAlertQueueServiceFactoryDep) => {
  const appCfg = getConfig();

  const enqueueEnabledAlerts = async () => {
    const scheduledAt = new Date().toISOString();
    for (const resourceType of alertProviderRegistry.resourceTypes()) {
      // eslint-disable-next-line no-await-in-loop
      const alerts = await alertDAL.findEnabledByResourceType(resourceType);
      // eslint-disable-next-line no-await-in-loop
      await Promise.all(
        alerts.map((alert) =>
          queueService.queue(
            QueueName.AlertDispatch,
            QueueJobs.AlertDispatch,
            { alertId: alert.id, scheduledAt },
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
        const { alertId, scheduledAt } = job.data;
        const alert = await alertDAL.findActiveById(alertId);

        if (!alert) {
          recordAlertDispatchOutcomeMetric({ resourceType: "unknown", outcome: AlertDispatchOutcome.AlertNotFound });
          return;
        }

        if (!alert.enabled) {
          recordAlertDispatchOutcomeMetric({
            resourceType: alert.resourceType,
            outcome: AlertDispatchOutcome.AlertDisabled
          });
          return;
        }

        const outcome = await alertEngine.runAlert(alert, {
          asOf: scheduledAt ? new Date(scheduledAt) : new Date()
        });
        recordAlertDispatchOutcomeMetric({ resourceType: alert.resourceType, outcome });
      },
      { concurrency: ALERT_DISPATCH_CONCURRENCY }
    );

    cronJob.register({
      name: CronJobName.DailyAlertProcessing,
      // Cadence is coupled to ALERT_SCAN_LEAD_* (alert-types.ts): providers scan one period ahead to
      // guarantee "at least alertBefore" lead. If this pattern changes, revisit that constant.
      pattern: appCfg.isDevelopmentMode ? "*/5 * * * *" : "0 0 * * *",
      runHashTtlS: 60 * 60 * 24,
      enabled: !appCfg.isSecondaryInstance,
      handler: async () => {
        logger.info("cron[daily-alert-processing]: enqueueing enabled alerts");
        await enqueueEnabledAlerts();
        logger.info("cron[daily-alert-processing]: enqueue complete");
      }
    });
  };

  return { init };
};
