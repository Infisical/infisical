import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";
import { QueueName, TQueueServiceFactory } from "@app/queue";

import { LogProvider } from "../audit-log-stream/audit-log-stream-enums";
import { TAuditLogStreamOutboxServiceFactory } from "./audit-log-stream-outbox-service";

const OUTBOX_WORKER_CONCURRENCY = 5;

// Sweeper cadence. Runs every 5 min — comfortably tighter than the 10-minute
// stale-claim threshold so a stuck worker is recovered within ~15 min worst case.
const STALE_CLAIM_SWEEPER_CRON = "*/5 * * * *";
const STALE_CLAIM_SWEEPER_RUN_HASH_TTL_S = 60 * 60;

// Cleanup cadence. Runs every 15 min to prune 'delivered' outbox rows past their
// retention window. Tighter than the old hourly cadence so deletes come in smaller,
// more frequent bursts (less autovacuum/bloat pressure) and the outbox table tracks
// the now-shorter delivered retention closely.
const CLEANUP_CRON = "*/15 * * * *";
// Per-fire hash dedup window — only needs to outlive a single run + retries, so 1h is
// ample for a 15-min cron (the hash id is keyed per scheduled fire, so this never gates
// future fires).
const CLEANUP_RUN_HASH_TTL_S = 60 * 60;

export type TAuditLogStreamOutboxQueueDep = {
  queueService: TQueueServiceFactory;
  cronJob: TCronJobFactory;
  auditLogStreamOutboxService: Pick<
    TAuditLogStreamOutboxServiceFactory,
    "drainStream" | "sweepStaleClaims" | "pruneDeliveredRows"
  >;
};

export const auditLogStreamOutboxQueueFactory = ({
  queueService,
  cronJob,
  auditLogStreamOutboxService
}: TAuditLogStreamOutboxQueueDep) => {
  queueService.start(
    QueueName.AuditLogStreamOutbox,
    async (job) => {
      const { streamId, orgId, provider } = job.data as { streamId: string; orgId: string; provider: LogProvider };
      try {
        await auditLogStreamOutboxService.drainStream({ streamId, orgId, provider });
      } catch (error) {
        logger.error(
          error,
          `audit-log-stream-outbox: flush worker crashed [provider=${provider}] [streamId=${streamId}] [orgId=${orgId}]`
        );
        throw error;
      }
    },
    { concurrency: OUTBOX_WORKER_CONCURRENCY }
  );

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
        try {
          await auditLogStreamOutboxService.pruneDeliveredRows();
        } catch (error) {
          logger.error(error as Error, "audit-log-stream-outbox: cleanup prune failed");
        }
      }
    });
  };

  return { init };
};
