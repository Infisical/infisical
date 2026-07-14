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
    | "hardDeleteIfExpired"
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
  // Per-pod, last-tick value: only the pod that won the cron redlock updates this; other pods report 0.
  // Alarms must aggregate with max() across pods, else a "stuck at cap" backlog gets diluted to ~0.
  let lastDiscoveryCount = 0;
  const discoveryGauge = meter.createObservableGauge("infisical.project_env_cleanup.discovered", {
    description:
      "Expired environments found on last discovery tick (capped at discovery batch). Sustained value at the cap = backlog remains.",
    unit: "{environment}"
  });
  discoveryGauge.addCallback((observableResult) => {
    if (!getConfig().OTEL_TELEMETRY_COLLECTION_ENABLED) return;
    observableResult.observe(lastDiscoveryCount);
  });

  const processEnvHardDelete = async (envId: string, projectId: string) => {
    const lock = await keyStore
      .acquireLock([KeyStorePrefixes.ProjectEnvironmentLock(projectId)], ENV_DELETE_LOCK_TTL_MS)
      .catch((err: unknown) => {
        logger.warn({ err }, `project-env-hard-delete: lock acquire error [envId=${envId}] [projectId=${projectId}]`);
        return null;
      });
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

      const deleted = await projectEnvDAL.transaction(async (tx) => {
        const doc = await projectEnvDAL.hardDeleteIfExpired(envId, projectId, tx);
        if (!doc) return undefined;
        await projectEnvDAL.closePositionGap(projectId, doc.position, tx);
        return doc;
      });

      if (!deleted) {
        logger.info(
          `project-env-hard-delete: environment restored/changed mid-flight, skipping delete [envId=${envId}] [projectId=${projectId}]`
        );
        return;
      }

      await auditLogService.createAuditLog({
        projectId,
        actor: { type: ActorType.PLATFORM, metadata: {} },
        event: {
          type: EventType.DELETE_ENVIRONMENT,
          metadata: {
            name: deleted.name,
            slug: deleted.slug,
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
        lastDiscoveryCount = expiredEnvs.length;
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
