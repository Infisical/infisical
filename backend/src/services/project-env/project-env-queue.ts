import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";
import { ActorType } from "@app/services/auth/auth-type";

import { TProjectEnvDALFactory } from "./project-env-dal";

export const SOFT_DELETE_GRACE_DAYS = 14;
export const SOFT_DELETE_GRACE_MS = SOFT_DELETE_GRACE_DAYS * 24 * 60 * 60 * 1000;

const HANDLER_TIMEOUT_MS = 15 * 60_000;

type TProjectEnvQueueFactoryDep = {
  projectEnvDAL: Pick<
    TProjectEnvDALFactory,
    "findByIdIncludingExpired" | "findExpiredForHardDelete" | "delete" | "transaction" | "closePositionGap"
  >;
  keyStore: Pick<TKeyStoreFactory, "acquireLock">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  cronJob: TCronJobFactory;
};

export type TProjectEnvQueueFactory = ReturnType<typeof projectEnvQueueFactory>;

export const projectEnvQueueFactory = ({
  projectEnvDAL,
  keyStore,
  auditLogService,
  cronJob
}: TProjectEnvQueueFactoryDep) => {
  const appCfg = getConfig();

  if (appCfg.isDailyResourceCleanUpDevelopmentMode) {
    logger.warn("Project environment hard-delete cron is in development mode.");
  }

  const hardDeleteEnvironment = async (envId: string, projectId: string) => {
    const lock = await keyStore
      .acquireLock([KeyStorePrefixes.ProjectEnvironmentLock(projectId)], 5000)
      .catch(() => null);
    if (!lock) {
      logger.warn(
        `project-env-hard-delete: could not acquire project lock, will retry next firing [envId=${envId}] [projectId=${projectId}]`
      );
      return;
    }

    try {
      // Read via transaction → primary, not replica. Defeats replica-lag races against a recent restore commit.
      const fresh = await projectEnvDAL.transaction((tx) => projectEnvDAL.findByIdIncludingExpired(envId, tx));
      if (!fresh || !fresh.hardDeletesAt || fresh.hardDeletesAt.getTime() > Date.now()) {
        logger.info(
          `project-env-hard-delete: skipping (gone/restored/not-yet-expired) [envId=${envId}] [projectId=${projectId}]`
        );
        return;
      }

      await projectEnvDAL.transaction(async (tx) => {
        await projectEnvDAL.delete({ id: envId, projectId }, tx);
        await projectEnvDAL.closePositionGap(projectId, fresh.position, tx);
      });
      logger.info(`project-env-hard-delete: hard-deleted environment [envId=${envId}] [projectId=${projectId}]`);

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
    } finally {
      await lock.release();
    }
  };

  const init = () => {
    cronJob.register({
      name: CronJobName.ProjectEnvHardDelete,
      pattern: appCfg.isDailyResourceCleanUpDevelopmentMode ? "*/5 * * * *" : "0 0 * * *",
      runHashTtlS: 3 * 24 * 60 * 60,
      handlerTimeoutMs: HANDLER_TIMEOUT_MS,
      leaseDurationMs: HANDLER_TIMEOUT_MS,
      enabled: !appCfg.isSecondaryInstance,
      handler: async () => {
        logger.info(`cron[${CronJobName.ProjectEnvHardDelete}]: task started`);
        const expiredEnvs = await projectEnvDAL.transaction((tx) => projectEnvDAL.findExpiredForHardDelete(tx));
        logger.info(
          `cron[${CronJobName.ProjectEnvHardDelete}]: found ${expiredEnvs.length} expired environment(s) to hard-delete`
        );

        const results = await Promise.allSettled(
          expiredEnvs.map((env) => hardDeleteEnvironment(env.id, env.projectId))
        );

        const successfulDeletes = results.filter((result) => result.status === "fulfilled");
        const failedDeletes = results.filter((result) => result.status === "rejected");

        logger.info(
          `cron[${CronJobName.ProjectEnvHardDelete}]: hard-deleted ${successfulDeletes.length} environment(s) successfully`
        );
        if (failedDeletes.length > 0) {
          logger.error(
            `cron[${CronJobName.ProjectEnvHardDelete}]: failed to hard-delete ${failedDeletes.length} environment(s)`
          );
        }
      }
    });
  };

  return { init };
};
