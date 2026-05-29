import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";
import { QueueName, TQueueServiceFactory } from "@app/queue";

import { LogProvider } from "../audit-log-stream/audit-log-stream-enums";
import { TAuditLogStreamOutboxServiceFactory } from "./audit-log-stream-outbox-service";

// Sweeper cadence. Runs every 5 min — comfortably tighter than the 10-minute
// stale-claim threshold so a stuck worker is recovered within ~15 min worst case.
const STALE_CLAIM_SWEEPER_CRON = "*/5 * * * *";
const STALE_CLAIM_SWEEPER_RUN_HASH_TTL_S = 60 * 60;

// Cleanup cadence. Runs hourly to prune both 'delivered' outbox rows and DLQ
// entries past their respective retention windows
const CLEANUP_CRON = "0 * * * *";
const CLEANUP_RUN_HASH_TTL_S = 24 * 60 * 60;

export type TAuditLogStreamOutboxQueueDep = {
  queueService: TQueueServiceFactory;
  cronJob: TCronJobFactory;
  auditLogStreamOutboxService: Pick<
    TAuditLogStreamOutboxServiceFactory,
    "drainStream" | "sweepStaleClaims" | "pruneDeliveredRows" | "pruneDlqEntries"
  >;
};

// Boots one BullMQ worker per provider so a slow upstream (e.g. a wedged
// Splunk HEC) can't block deliveries to a healthy one (e.g. Datadog).
export const auditLogStreamOutboxQueueFactory = ({
  queueService,
  cronJob,
  auditLogStreamOutboxService
}: TAuditLogStreamOutboxQueueDep) => {
  const registerWorker = <T extends QueueName>(queueName: T, provider: LogProvider) => {
    queueService.start(queueName, async (job) => {
      const { streamId, orgId } = job.data as { streamId: string; orgId: string };
      try {
        await auditLogStreamOutboxService.drainStream({ streamId, orgId, provider });
      } catch (error) {
        logger.error(
          error,
          `audit-log-stream-outbox: flush worker crashed [provider=${provider}] [streamId=${streamId}] [orgId=${orgId}]`
        );
        throw error;
      }
    });
  };

  registerWorker(QueueName.AuditLogStreamAzure, LogProvider.Azure);
  registerWorker(QueueName.AuditLogStreamCribl, LogProvider.Cribl);
  registerWorker(QueueName.AuditLogStreamCustom, LogProvider.Custom);
  registerWorker(QueueName.AuditLogStreamDatadog, LogProvider.Datadog);
  registerWorker(QueueName.AuditLogStreamSplunk, LogProvider.Splunk);

  const init = () => {
    cronJob.register({
      name: CronJobName.AuditLogStreamOutboxStaleClaimSweeper,
      pattern: STALE_CLAIM_SWEEPER_CRON,
      runHashTtlS: STALE_CLAIM_SWEEPER_RUN_HASH_TTL_S,
      handler: async () => {
        await auditLogStreamOutboxService.sweepStaleClaims();
      }
    });

    cronJob.register({
      name: CronJobName.AuditLogStreamOutboxCleanup,
      pattern: CLEANUP_CRON,
      runHashTtlS: CLEANUP_RUN_HASH_TTL_S,
      handler: async () => {
        const results = await Promise.allSettled([
          auditLogStreamOutboxService.pruneDeliveredRows(),
          auditLogStreamOutboxService.pruneDlqEntries()
        ]);
        for (const result of results) {
          if (result.status === "rejected") {
            logger.error(result.reason as Error, "audit-log-stream-outbox: cleanup prune failed");
          }
        }
      }
    });
  };

  return { init };
};
