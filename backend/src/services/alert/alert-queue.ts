import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";
import { AlertDispatchOutcome, recordAlertDispatchOutcomeMetric } from "@app/lib/telemetry/metrics";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { TAlertDALFactory } from "./alert-dal";
import { TAlertEngine } from "./alert-engine";
import { TAlertHistoryDALFactory } from "./alert-history-dal";
import { TAlertProviderRegistry } from "./alert-provider-registry";
import { ALERT_HISTORY_RETENTION_DAYS } from "./alert-types";

type TAlertQueueServiceFactoryDep = {
  cronJob: TCronJobFactory;
  queueService: TQueueServiceFactory;
  alertDAL: Pick<TAlertDALFactory, "findEnabledByResourceType" | "findActiveById">;
  alertHistoryDAL: Pick<TAlertHistoryDALFactory, "deleteExpiredHistory">;
  alertProviderRegistry: TAlertProviderRegistry;
  alertEngine: Pick<TAlertEngine, "runAlert">;
};

const ALERT_DISPATCH_CONCURRENCY = 5;

export const alertQueueServiceFactory = ({
  cronJob,
  queueService,
  alertDAL,
  alertHistoryDAL,
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

  const pruneExpiredHistory = async () => {
    const before = new Date(Date.now() - ALERT_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const { deleted, hasMore } = await alertHistoryDAL.deleteExpiredHistory({ before });

    logger.info(
      `cron[daily-alert-processing]: pruned alert history older than ${ALERT_HISTORY_RETENTION_DAYS} days [deleted=${deleted}] [hasMore=${hasMore}]`
    );
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

        try {
          const outcome = await alertEngine.runAlert(alert, {
            asOf: scheduledAt ? new Date(scheduledAt) : new Date()
          });
          recordAlertDispatchOutcomeMetric({ resourceType: alert.resourceType, outcome });
        } catch (err) {
          logger.error(err, `Alert dispatch failed [alertId=${alertId}] [resourceType=${alert.resourceType}]`);
          throw err;
        }
      },
      { concurrency: ALERT_DISPATCH_CONCURRENCY }
    );

    cronJob.register({
      name: CronJobName.DailyAlertProcessing,
      pattern: appCfg.isDevelopmentMode ? "*/5 * * * *" : "0 0 * * *",
      runHashTtlS: 60 * 60 * 24,
      enabled: !appCfg.isSecondaryInstance,
      handler: async () => {
        logger.info("cron[daily-alert-processing]: enqueueing enabled alerts");
        await enqueueEnabledAlerts();
        logger.info("cron[daily-alert-processing]: enqueue complete");

        await pruneExpiredHistory();
      }
    });
  };

  return { init };
};
