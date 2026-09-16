import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TAgentVaultSessionDALFactory } from "../agent-vault-session/agent-vault-session-dal";
import { TAgentVaultActivityConfigDALFactory } from "./agent-vault-activity-config-dal";
import { AGENT_VAULT_ACTIVITY_SWEEP_BATCH } from "./agent-vault-activity-constants";
import {
  buildActivityStorage,
  buildSessionPrefix,
  resolveStorageConfig,
  TAgentVaultActivityStorage
} from "./agent-vault-activity-storage";

const SESSION_RETENTION_DAYS = 30;
const SWEEP_DEADLINE_MS = 25 * 60_000;

type TAgentVaultActivitySweepServiceFactoryDep = {
  agentVaultSessionDAL: Pick<
    TAgentVaultSessionDALFactory,
    "pruneRetiredBefore" | "findRetiredWithChunksBefore" | "deleteById" | "transaction"
  >;
  agentVaultActivityConfigDAL: Pick<TAgentVaultActivityConfigDALFactory, "findOne" | "decrementStoredRecordCount">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey" | "decryptWithInputKey">;
  cronJob: TCronJobFactory;
};

export type TAgentVaultActivitySweepServiceFactory = ReturnType<typeof agentVaultActivitySweepServiceFactory>;

type TProjectStorage = {
  storage: TAgentVaultActivityStorage | null;
  configId: string | null;
  keyPrefix: string | null;
};

export const agentVaultActivitySweepServiceFactory = ({
  agentVaultSessionDAL,
  agentVaultActivityConfigDAL,
  appConnectionDAL,
  kmsService,
  cronJob
}: TAgentVaultActivitySweepServiceFactoryDep) => {
  /**
   * Expiry itself needs no sweep: it is enforced against the clock on every resolve and derived per row
   * on read. This exists for the 30 day hard delete, and for deleting the activity objects that go with it.
   */
  const sweepRetiredSessions = async () => {
    const startedAt = Date.now();
    const cutoff = new Date(startedAt - SESSION_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const pruned = await agentVaultSessionDAL.pruneRetiredBefore(cutoff);

    const storages = new Map<string, TProjectStorage>();
    const brokenProjects = new Set<string>();
    const failedSessionIds = new Set<string>();

    let swept = 0;
    let orphanedObjects = 0;
    let batches = 0;

    const loadStorage = async (projectId: string, orgId: string): Promise<TProjectStorage> => {
      const cached = storages.get(projectId);
      if (cached) return cached;

      const config = await agentVaultActivityConfigDAL.findOne({ projectId });
      const resolved = config ? resolveStorageConfig(config) : null;
      if (!config || !resolved) {
        // The config row went away, or the connection was detached. The rows still have to go; the
        // objects are left behind and counted.
        const entry: TProjectStorage = { storage: null, configId: config?.id ?? null, keyPrefix: null };
        storages.set(projectId, entry);
        return entry;
      }

      const storage = await buildActivityStorage(resolved, orgId, { appConnectionDAL, kmsService });
      const entry: TProjectStorage = { storage, configId: config.id, keyPrefix: resolved.keyPrefix };
      storages.set(projectId, entry);
      return entry;
    };

    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const targets = await agentVaultSessionDAL.findRetiredWithChunksBefore({
        cutoff,
        limit: AGENT_VAULT_ACTIVITY_SWEEP_BATCH,
        excludeSessionIds: [...failedSessionIds],
        excludeProjectIds: [...brokenProjects]
      });
      if (!targets.length) break;

      batches += 1;
      let sweptThisBatch = 0;

      for (const target of targets) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const entry = await loadStorage(target.projectId, target.orgId);

          if (entry.storage) {
            // Objects before rows, always. A row delete that fails after the objects are gone is repaired
            // by tomorrow's run finding an empty prefix; rows first would orphan the objects forever.
            // eslint-disable-next-line no-await-in-loop
            await entry.storage.deletePrefix(
              buildSessionPrefix({
                keyPrefix: entry.keyPrefix,
                projectId: target.projectId,
                sessionId: target.sessionId
              })
            );
          } else {
            orphanedObjects += 1;
            logger.warn(
              `agent-vault: activity objects left behind, project has no usable storage config [sessionId=${target.sessionId}] [projectId=${target.projectId}]`
            );
          }

          // eslint-disable-next-line no-await-in-loop
          await agentVaultSessionDAL.transaction(async (tx) => {
            if (entry.configId) {
              await agentVaultActivityConfigDAL.decrementStoredRecordCount(entry.configId, target.recordCount, tx);
            }
            // The chunk rows cascade with the session.
            await agentVaultSessionDAL.deleteById(target.sessionId, tx);
          });

          swept += 1;
          sweptThisBatch += 1;
        } catch (error) {
          failedSessionIds.add(target.sessionId);
          // A project whose storage cannot be built at all is skipped wholesale for this run, or every
          // one of its sessions pays the same failure.
          if (!storages.has(target.projectId)) brokenProjects.add(target.projectId);
          logger.error(
            error,
            `agent-vault: activity sweep failed for a session [sessionId=${target.sessionId}] [projectId=${target.projectId}]`
          );
        }
      }

      if (targets.length < AGENT_VAULT_ACTIVITY_SWEEP_BATCH || Date.now() - startedAt > SWEEP_DEADLINE_MS) {
        break;
      }
      if (sweptThisBatch === 0 && failedSessionIds.size === 0 && brokenProjects.size === 0) {
        // Nothing swept and nothing excluded means the next query would return this batch again.
        break;
      }
    }

    logger.info(
      `agent-vault: activity sweep done [pruned=${pruned}] [swept=${swept}] [orphanedObjects=${orphanedObjects}] [failed=${failedSessionIds.size}] [brokenProjects=${brokenProjects.size}] [batches=${batches}]`
    );
  };

  /**
   * Its own cron rather than a step inside the shared daily cleanup: the S3 pass is network-bound and not
   * proportional to row count, so a slow bucket inside that handler would time out the whole run and take
   * every other prune with it.
   */
  const init = () => {
    const appCfg = getConfig();
    const devMode = appCfg.NODE_ENV === "development";
    const timeoutMs = devMode ? 5 * 60_000 : 30 * 60_000;

    cronJob.register({
      name: CronJobName.AgentVaultSessionSweep,
      pattern: devMode ? "*/5 * * * *" : "45 0 * * *",
      runHashTtlS: 3 * 24 * 60 * 60,
      handlerTimeoutMs: timeoutMs,
      leaseDurationMs: timeoutMs,
      enabled: !appCfg.isSecondaryInstance,
      handler: async () => {
        logger.info(`cron[${CronJobName.AgentVaultSessionSweep}]: task started`);
        await sweepRetiredSessions();
      }
    });
  };

  return { init, sweepRetiredSessions };
};
