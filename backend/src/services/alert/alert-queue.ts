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

  // Dispatch driven by something happening rather than by the cron tick. The cron is daily in
  // production, which is right for "this expires soon" and useless for "this just happened".
  //
  // The jobId deliberately carries no timestamp: several violations landing in the same second
  // collapse onto one dispatch, and that dispatch reads every due target anyway. Dedup inside the
  // engine is what stops a target being mailed about twice.
  const enqueueAlertsForEvent = async ({ resourceType, orgId }: { resourceType: string; orgId: string }) => {
    const alerts = await alertDAL.findEnabledByResourceType(resourceType);
    const scoped = alerts.filter((alert) => alert.orgId === orgId);
    if (!scoped.length) return;

    const scheduledAt = new Date().toISOString();
    await Promise.all(
      scoped.map((alert) =>
        queueService.queue(
          QueueName.AlertDispatch,
          QueueJobs.AlertDispatch,
          { alertId: alert.id, scheduledAt },
          {
            jobId: `alert-dispatch-event-${alert.id}`,
            removeOnComplete: true,
            removeOnFail: true,
            attempts: 1
          }
        )
      )
    );
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

  return { init, enqueueAlertsForEvent };
};
