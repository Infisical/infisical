import opentelemetry from "@opentelemetry/api";

import { AccessScope } from "@app/db/schemas";
import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { ActorType } from "../auth/auth-type";
import { TKmsServiceFactory } from "../kms/kms-service";
import { TMembershipUserDALFactory } from "../membership-user/membership-user-dal";
import { TUserDALFactory } from "../user/user-dal";
import { TProjectDALFactory } from "./project-dal";

// ── load shaping ──────────────────────────────────────────────────────────────
// The cron tick is NOT the pacer — it only keeps the queue fed. Selecting the oldest
// DISCOVERY_BATCH expired projects (ORDER BY deleteAfter ASC) + jobId dedupe keeps the in-flight
// set bounded at ~DISCOVERY_BATCH regardless of backlog size (we never enqueue 85k at once).
// The worker meters the actual drain RATE via the rate limiter + concurrency, so DB load is a
// flat plateau rather than a per-tick spike.
const DISCOVERY_BATCH = 200;
const WORKER_CONCURRENCY = 3; // ceiling on simultaneous heavy deletes (fleet-wide)
const RATE_LIMIT_MAX = 30; // steady drain rate: 30 projects / minute
const RATE_LIMIT_DURATION_MS = 60 * 1000;

// per-project chunked secret_versions_v2 delete tuning
const SECRET_VERSION_DELETE_BATCH = 5000;
const BATCH_STATEMENT_TIMEOUT_MS = 30 * 1000;
const INTER_BATCH_SLEEP_MS = 10;

// Generous so a large project's chunked delete won't see the lock expire mid-flight and let a
// second worker start; crash recovery happens on the next cron tick after expiry.
const PROJECT_DELETE_LOCK_TTL_MS = 30 * 60 * 1000;
const CRON_HANDLER_TIMEOUT_MS = 5 * 60 * 1000;

type TProjectCleanupQueueFactoryDep = {
  projectDAL: Pick<
    TProjectDALFactory,
    | "findExpiredForHardDelete"
    | "countPendingHardDelete"
    | "findByIdIncludingExpired"
    | "findIncludingExpired"
    | "findProjectGhostUser"
    | "hardDeleteProjectSecretVersionsInBatches"
    | "deleteById"
    | "transaction"
  >;
  membershipUserDAL: Pick<TMembershipUserDALFactory, "delete">;
  userDAL: Pick<TUserDALFactory, "deleteById">;
  kmsService: Pick<TKmsServiceFactory, "deleteInternalKms">;
  keyStore: Pick<TKeyStoreFactory, "acquireLock" | "deleteItem">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  queueService: Pick<TQueueServiceFactory, "queue" | "start">;
  cronJob: TCronJobFactory;
};

export type TProjectCleanupQueueFactory = ReturnType<typeof projectCleanupQueueFactory>;

export const projectCleanupQueueFactory = ({
  projectDAL,
  membershipUserDAL,
  userDAL,
  kmsService,
  keyStore,
  auditLogService,
  queueService,
  cronJob
}: TProjectCleanupQueueFactoryDep) => {
  const appCfg = getConfig();

  if (appCfg.isDailyResourceCleanUpDevelopmentMode) {
    logger.warn("Project hard-delete cron is in development mode.");
  }

  // ── observability ─────────────────────────────────────────────────────────────
  // Generic per-queue metrics (job count/duration/wait/depth, tagged queue.name=project-hard-delete)
  // come for free from queue-service. These are the domain-specific signals that tell us whether the
  // drain is healthy or the knobs (RATE_LIMIT_MAX / WORKER_CONCURRENCY / SECRET_VERSION_DELETE_BATCH)
  // need tuning — and surface a mass-delete event early.
  const meter = opentelemetry.metrics.getMeter("InfisicalCore");
  const processedCounter = meter.createCounter("infisical.project_cleanup.processed", {
    description: "Projects processed by the hard-delete worker, by outcome (deleted/skipped/failed)",
    unit: "{project}"
  });
  const durationHistogram = meter.createHistogram("infisical.project_cleanup.duration", {
    description: "Per-project hard-delete wall-clock seconds. Rising p95 → raise concurrency/limiter or lower batch.",
    unit: "s"
  });
  const versionsPrunedHistogram = meter.createHistogram("infisical.project_cleanup.secret_versions_pruned", {
    description: "secret_versions_v2 rows pruned per project — reveals project-size distribution for batch tuning",
    unit: "{row}"
  });
  // Queue depth caps at ~DISCOVERY_BATCH, so it can't reveal the true
  // backlog. This counts projects with deleteAfter set directly in the DB. Sustained growth = the
  // drain rate can't keep up  or a mass-delete is in progress.
  const pendingGauge = meter.createObservableGauge("infisical.project_cleanup.pending", {
    description:
      "Projects awaiting hard delete (deleteAfter set). Sustained growth = drain can't keep up / mass-delete.",
    unit: "{project}"
  });
  pendingGauge.addCallback(async (observableResult) => {
    if (!getConfig().OTEL_TELEMETRY_COLLECTION_ENABLED) return;
    try {
      observableResult.observe(await projectDAL.countPendingHardDelete());
    } catch (err) {
      logger.warn({ err }, "project_cleanup.pending gauge: count failed");
    }
  });

  const processProjectHardDelete = async (projectId: string) => {
    const startedAt = Date.now();
    const lock = await keyStore
      .acquireLock([KeyStorePrefixes.ProjectDeleteLock(projectId)], PROJECT_DELETE_LOCK_TTL_MS)
      .catch(() => null);
    if (!lock) {
      processedCounter.add(1, { outcome: "skipped", reason: "locked" });
      logger.info(`project-hard-delete: lock held, will retry next firing [projectId=${projectId}]`);
      return;
    }

    try {
      // Read via transaction → primary, not replica. Defeats replica-lag races against a concurrent
      // worker that already finished.
      const project = await projectDAL.transaction((tx) => projectDAL.findByIdIncludingExpired(projectId, tx));
      if (!project || !project.deleteAfter || new Date(project.deleteAfter).getTime() > Date.now()) {
        processedCounter.add(1, { outcome: "skipped", reason: "gone_or_restored" });
        logger.info(`project-hard-delete: skipping (gone/already-removed/not-yet-expired) [projectId=${projectId}]`);
        return;
      }

      // 1) Chunk-delete the largest project-scoped table ahead of the final cascade. secret_versions_v2
      // has no folderId/secretId FK (only a mostly-NULL envId cascade), so the project-delete cascade
      // would otherwise orphan ~all of these rows. Deleting by folderId is FK-safe and bounds the
      // final cascade's transaction size.
      const deletedVersions = await projectDAL.hardDeleteProjectSecretVersionsInBatches(
        projectId,
        SECRET_VERSION_DELETE_BATCH,
        BATCH_STATEMENT_TIMEOUT_MS,
        INTER_BATCH_SLEEP_MS
      );

      // 2) Final cascade in one transaction — handles the remaining (smaller) child tables, including
      // deferred / NO ACTION FKs (e.g. secret_rotation_v2_secret_mappings) that PG resolves correctly
      // as a single cascade tree (the same proven path the synchronous delete used).
      const deleted = await projectDAL.transaction(async (tx) => {
        // capture the ghost user before its project membership is removed below
        const ghostUser = await projectDAL.findProjectGhostUser(projectId, tx).catch(() => null);

        await membershipUserDAL.delete(
          { scopeOrgId: project.orgId, scopeProjectId: projectId, scope: AccessScope.Project },
          tx
        );

        const delProject = await projectDAL.deleteById(projectId, tx);
        // a racing worker may have hard-deleted it after our re-read but before we acquired the row
        if (!delProject) return false;

        // before removing a KMS key, ensure no other (incl. pending-deletion) project references it
        if (delProject.kmsCertificateKeyId) {
          const linked = await projectDAL.findIncludingExpired(
            { kmsCertificateKeyId: delProject.kmsCertificateKeyId },
            { tx }
          );
          if (!linked.length) await kmsService.deleteInternalKms(delProject.kmsCertificateKeyId, delProject.orgId, tx);
        }
        if (delProject.kmsSecretManagerKeyId) {
          const linked = await projectDAL.findIncludingExpired(
            { kmsSecretManagerKeyId: delProject.kmsSecretManagerKeyId },
            { tx }
          );
          if (!linked.length)
            await kmsService.deleteInternalKms(delProject.kmsSecretManagerKeyId, delProject.orgId, tx);
        }

        if (ghostUser) await userDAL.deleteById(ghostUser.id, tx);
        return true;
      });

      if (!deleted) {
        processedCounter.add(1, { outcome: "skipped", reason: "already_removed" });
        logger.info(`project-hard-delete: already removed by a concurrent worker [projectId=${projectId}]`);
        return;
      }

      await keyStore.deleteItem(KeyStorePrefixes.LicenseCloudPlan(project.orgId));
      await auditLogService.createAuditLog({
        orgId: project.orgId,
        projectId,
        actor: { type: ActorType.PLATFORM, metadata: {} },
        event: {
          type: EventType.DELETE_PROJECT,
          metadata: { id: projectId, name: project.name, softDelete: false }
        }
      });

      const durationSec = (Date.now() - startedAt) / 1000;
      processedCounter.add(1, { outcome: "deleted" });
      durationHistogram.record(durationSec);
      versionsPrunedHistogram.record(deletedVersions);
      logger.info(
        { projectId, deletedVersions, durationSec },
        `project-hard-delete: hard-deleted project [projectId=${projectId}] [versionsPruned=${deletedVersions}] [durationSec=${durationSec.toFixed(1)}]`
      );
    } catch (err) {
      processedCounter.add(1, { outcome: "failed" });
      logger.error({ err, projectId }, `project-hard-delete: failed [projectId=${projectId}]`);
      throw err; // surface to BullMQ so it retries (attempts: 3) and the generic failure metric fires
    } finally {
      await lock.release();
    }
  };

  const init = () => {
    // Worker: meters the actual drain rate. concurrency caps parallelism; the limiter caps throughput
    // (fleet-wide via Redis) so a backlog drains as an even plateau instead of a burst.
    queueService.start(
      QueueName.ProjectHardDelete,
      async (job) => {
        await processProjectHardDelete(job.data.projectId);
      },
      { concurrency: WORKER_CONCURRENCY, limiter: { max: RATE_LIMIT_MAX, duration: RATE_LIMIT_DURATION_MS } }
    );

    // Cron tick: discovery only (fast). Enqueues the oldest expired projects; jobId dedupe keeps the
    // queue bounded and idempotent across ticks.
    cronJob.register({
      name: CronJobName.ProjectHardDelete,
      pattern: appCfg.isDailyResourceCleanUpDevelopmentMode ? "* * * * *" : "*/5 * * * *",
      runHashTtlS: 3 * 24 * 60 * 60,
      handlerTimeoutMs: CRON_HANDLER_TIMEOUT_MS,
      leaseDurationMs: CRON_HANDLER_TIMEOUT_MS,
      enabled: !appCfg.isSecondaryInstance,
      handler: async () => {
        const expiredProjects = await projectDAL.findExpiredForHardDelete(DISCOVERY_BATCH);
        if (expiredProjects.length === 0) return;

        logger.info(`cron[${CronJobName.ProjectHardDelete}]: enqueuing ${expiredProjects.length} expired project(s)`);
        await Promise.all(
          expiredProjects.map((project) =>
            queueService.queue(
              QueueName.ProjectHardDelete,
              QueueJobs.ProjectHardDelete,
              { projectId: project.id },
              {
                jobId: `project-hard-delete-${project.id}`,
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
