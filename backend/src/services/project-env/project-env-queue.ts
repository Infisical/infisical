import opentelemetry from "@opentelemetry/api";

import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { ActorType } from "@app/services/auth/auth-type";

import { TProjectEnvDALFactory } from "./project-env-dal";

export const SOFT_DELETE_GRACE_DAYS = 14;
export const SOFT_DELETE_GRACE_MS = SOFT_DELETE_GRACE_DAYS * 24 * 60 * 60 * 1000;

const DISCOVERY_BATCH = 200;
const WORKER_CONCURRENCY = 3;
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_DURATION_MS = 60 * 1000;

const SECRET_VERSION_DELETE_BATCH = 5000;
const BATCH_STATEMENT_TIMEOUT_MS = 30 * 1000;
const INTER_BATCH_SLEEP_MS = 10;

// Longer than the worst-case chunked delete so the lock can't expire mid-flight and let a second worker in.
const ENV_DELETE_LOCK_TTL_MS = 30 * 60 * 1000;
const CRON_HANDLER_TIMEOUT_MS = 5 * 60 * 1000;

type TProjectEnvQueueFactoryDep = {
  projectEnvDAL: Pick<
    TProjectEnvDALFactory,
    | "findByIdIncludingExpired"
    | "findExpiredForHardDelete"
    | "countPendingHardDelete"
    | "delete"
    | "transaction"
    | "closePositionGap"
    | "hardDeleteEnvironmentSecretVersionsInBatches"
  >;
  keyStore: Pick<TKeyStoreFactory, "acquireLock">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  queueService: Pick<TQueueServiceFactory, "queue" | "start">;
  cronJob: TCronJobFactory;
};

export type TProjectEnvQueueFactory = ReturnType<typeof projectEnvQueueFactory>;

export const projectEnvQueueFactory = ({
  projectEnvDAL,
  keyStore,
  auditLogService,
  queueService,
  cronJob
}: TProjectEnvQueueFactoryDep) => {
  const appCfg = getConfig();

  if (appCfg.isDailyResourceCleanUpDevelopmentMode) {
    logger.warn("Project environment hard-delete cron is in development mode.");
  }

  const meter = opentelemetry.metrics.getMeter("InfisicalCore");
  const pendingGauge = meter.createObservableGauge("infisical.project_env_cleanup.pending", {
    description: "Environments awaiting hard delete (deleteAfter set).",
    unit: "{environment}"
  });
  pendingGauge.addCallback(async (observableResult) => {
    if (!getConfig().OTEL_TELEMETRY_COLLECTION_ENABLED) return;
    try {
      observableResult.observe(await projectEnvDAL.countPendingHardDelete());
    } catch (err) {
      logger.warn({ err }, "project_env_cleanup.pending gauge: count failed");
    }
  });

  const processEnvHardDelete = async (envId: string, projectId: string) => {
    const lock = await keyStore
      .acquireLock([KeyStorePrefixes.ProjectEnvironmentLock(projectId)], ENV_DELETE_LOCK_TTL_MS)
      .catch(() => null);
    if (!lock) {
      logger.info(
        `project-env-hard-delete: lock held, will retry next firing [envId=${envId}] [projectId=${projectId}]`
      );
      return;
    }

    try {
      // Read via primary (not replica) to defeat replica-lag races against a recent restore commit.
      const fresh = await projectEnvDAL.transaction((tx) => projectEnvDAL.findByIdIncludingExpired(envId, tx));
      if (!fresh || !fresh.deleteAfter || new Date(fresh.deleteAfter).getTime() > Date.now()) {
        logger.info(
          `project-env-hard-delete: skipping (gone/restored/not-yet-expired) [envId=${envId}] [projectId=${projectId}]`
        );
        return;
      }

      // secret_versions_v2 has no FK back to the folder/env tree, so the cascade below would orphan it.
      // must be deleted first, while its folders still exist to identify the rows.
      const deletedVersions = await projectEnvDAL.hardDeleteEnvironmentSecretVersionsInBatches(
        envId,
        SECRET_VERSION_DELETE_BATCH,
        BATCH_STATEMENT_TIMEOUT_MS,
        INTER_BATCH_SLEEP_MS
      );

      await projectEnvDAL.transaction(async (tx) => {
        await projectEnvDAL.delete({ id: envId, projectId }, tx);
        await projectEnvDAL.closePositionGap(projectId, fresh.position, tx);
      });

      await auditLogService.createAuditLog({
        projectId,
        actor: { type: ActorType.PLATFORM, metadata: {} },
        event: {
          type: EventType.DELETE_ENVIRONMENT,
          metadata: {
            name: fresh.name,
            slug: fresh.slug,
            hardDelete: true
          }
        }
      });

      logger.info(
        { envId, projectId, deletedVersions },
        `project-env-hard-delete: hard-deleted environment [envId=${envId}] [projectId=${projectId}] [versionsPruned=${deletedVersions}]`
      );
    } catch (err) {
      logger.error(
        { err, envId, projectId },
        `project-env-hard-delete: failed [envId=${envId}] [projectId=${projectId}]`
      );
      throw err; // surface to BullMQ so it retries
    } finally {
      await lock.release();
    }
  };

  const init = () => {
    // concurrency + limiter shape aggregate DB load; the cron only feeds the queue, it isn't the pacer.
    queueService.start(
      QueueName.ProjectEnvHardDelete,
      async (job) => {
        await processEnvHardDelete(job.data.envId, job.data.projectId);
      },
      { concurrency: WORKER_CONCURRENCY, limiter: { max: RATE_LIMIT_MAX, duration: RATE_LIMIT_DURATION_MS } }
    );

    // Discovery only: enqueue the oldest expired environments; jobId dedupe keeps the queue bounded.
    cronJob.register({
      name: CronJobName.ProjectEnvHardDelete,
      pattern: appCfg.isDailyResourceCleanUpDevelopmentMode ? "* * * * *" : "*/5 * * * *",
      runHashTtlS: 3 * 24 * 60 * 60,
      handlerTimeoutMs: CRON_HANDLER_TIMEOUT_MS,
      leaseDurationMs: CRON_HANDLER_TIMEOUT_MS,
      enabled: !appCfg.isSecondaryInstance,
      handler: async () => {
        const expiredEnvs = await projectEnvDAL.findExpiredForHardDelete(DISCOVERY_BATCH);
        if (expiredEnvs.length === 0) return;

        logger.info(
          `cron[${CronJobName.ProjectEnvHardDelete}]: enqueuing ${expiredEnvs.length} expired environment(s)`
        );
        await Promise.all(
          expiredEnvs.map((env) =>
            queueService.queue(
              QueueName.ProjectEnvHardDelete,
              QueueJobs.ProjectEnvHardDelete,
              { envId: env.id, projectId: env.projectId },
              {
                jobId: `project-env-hard-delete-${env.id}`,
                removeOnComplete: true,
                removeOnFail: true,
                attempts: 3,
                backoff: { type: "exponential", delay: 5000 }
              }
            )
          )
        );
      }
    });
  };

  return { init };
};
