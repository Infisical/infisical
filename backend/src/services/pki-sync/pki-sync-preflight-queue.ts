import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";
import { resolveCoreMeter } from "@app/lib/telemetry/metrics";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { ActorType } from "@app/services/auth/auth-type";
import { TCertificateSyncDALFactory } from "@app/services/certificate-sync/certificate-sync-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TAppConnectionDALFactory } from "../app-connection/app-connection-dal";
import { TCertificateBodyDALFactory } from "../certificate/certificate-body-dal";
import { TCertificateDALFactory } from "../certificate/certificate-dal";
import { TCertificateSecretDALFactory } from "../certificate/certificate-secret-dal";
import { TCertificateAuthorityCertDALFactory } from "../certificate-authority/certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "../certificate-authority/certificate-authority-dal";
import { buildCertificateMap } from "./pki-sync-certificate-map-fns";
import { hydratePkiSyncCredentials } from "./pki-sync-credentials-fns";
import { TPkiSyncDALFactory } from "./pki-sync-dal";
import { PkiSyncStatus } from "./pki-sync-enums";
import { PkiSyncFns, truncateSyncMessage } from "./pki-sync-fns";
import {
  buildPreflightCommandFailureMessage,
  didPreflightCheckFail,
  getPreflightCommand
} from "./pki-sync-preflight-command-fns";

// A check waits up to PREFLIGHT_COMMAND_TIMEOUT_MS, so WORKER_CONCURRENCY is what sets throughput:
// roughly (concurrency / 10s) = 18 checks a minute, about 26k in a day. The batch is sized under that
// so a tick never enqueues more than the fleet can drain before the next one, and it logs when it
// truncates, because past this point some syncs would go unchecked. Raising it means raising
// concurrency too, and that spends gateway capacity shared with real syncs.
const DISCOVERY_BATCH = 10_000;
const WORKER_CONCURRENCY = 3;
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_DURATION_MS = 60 * 1000;

const CRON_HANDLER_TIMEOUT_MS = 60 * 1000;

const PREFLIGHT_LOCK_TTL_MS = 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

type TPkiSyncPreflightQueueFactoryDep = {
  cronJob: TCronJobFactory;
  queueService: Pick<TQueueServiceFactory, "queue" | "start">;
  pkiSyncDAL: Pick<
    TPkiSyncDALFactory,
    "countPkiSyncsWithPreflightCommand" | "findPkiSyncsWithPreflightCommand" | "findById" | "updateById"
  >;
  keyStore: Pick<TKeyStoreFactory, "acquireLock">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  projectDAL: TProjectDALFactory;
  kmsService: Pick<
    TKmsServiceFactory,
    "createCipherPairWithDataKey" | "decryptWithKmsKey" | "generateKmsKey" | "encryptWithKmsKey"
  >;
  certificateDAL: TCertificateDALFactory;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "findOne">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "findOne">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById">;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "findById">;
  certificateSyncDAL: TCertificateSyncDALFactory;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  gatewayV2Service?: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService?: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
};

export type TPkiSyncPreflightQueueFactory = ReturnType<typeof pkiSyncPreflightQueueFactory>;

export const pkiSyncPreflightQueueFactory = ({
  cronJob,
  queueService,
  pkiSyncDAL,
  keyStore,
  appConnectionDAL,
  projectDAL,
  kmsService,
  certificateDAL,
  certificateBodyDAL,
  certificateSecretDAL,
  certificateAuthorityDAL,
  certificateAuthorityCertDAL,
  certificateSyncDAL,
  auditLogService,
  gatewayV2Service,
  gatewayPoolService
}: TPkiSyncPreflightQueueFactoryDep) => {
  const appCfg = getConfig();

  const meter = resolveCoreMeter();
  let lastDiscoveryCount = 0;
  const discoveryGauge = meter.createObservableGauge("infisical.pki_sync_preflight.discovered", {
    description:
      "PKI syncs with a preflight check configured. Above the discovery batch the checks span more than a day, so each sync is probed less often than daily.",
    unit: "{sync}"
  });
  discoveryGauge.addCallback((observableResult) => {
    if (!getConfig().OTEL_TELEMETRY_COLLECTION_ENABLED) return;
    observableResult.observe(lastDiscoveryCount);
  });

  const $processPreflightCheck = async (syncId: string) => {
    const pkiSync = await pkiSyncDAL.findById(syncId);
    if (!pkiSync) {
      logger.info(`cron[${CronJobName.PkiSyncPreflightCheck}]: sync is gone, skipping [syncId=${syncId}]`);
      return;
    }

    const command = getPreflightCommand(pkiSync.syncOptions);
    if (!command) {
      logger.info(
        `cron[${CronJobName.PkiSyncPreflightCheck}]: preflight command was cleared, skipping [syncId=${syncId}]`
      );
      return;
    }

    const pkiSyncWithCredentials = await hydratePkiSyncCredentials({
      pkiSync,
      appConnectionDAL,
      projectDAL,
      kmsService
    });

    // Resolved before taking the lock: it costs one KMS decrypt per linked certificate, so holding a
    // sync-blocking lock across it would scale the locked window with the certificate count.
    const { certificateMap } = await buildCertificateMap(pkiSync, {
      certificateDAL,
      certificateBodyDAL,
      certificateSecretDAL,
      certificateAuthorityDAL,
      certificateAuthorityCertDAL,
      certificateSyncDAL,
      projectDAL,
      kmsService
    });

    // The lock a sync run takes, held only around the command itself and the status it writes, both
    // of which are bounded. A run does its own check, so skipping avoids a second concurrent command
    // on the host and keeps both from writing the sync's status.
    const lock = await keyStore
      .acquireLock([KeyStorePrefixes.PkiSyncLock(syncId)], PREFLIGHT_LOCK_TTL_MS)
      .catch(() => null);
    if (!lock) {
      logger.info(`cron[${CronJobName.PkiSyncPreflightCheck}]: a sync is already running, skipping [syncId=${syncId}]`);
      return;
    }

    let result;
    try {
      result = await PkiSyncFns.runPreflightCheck(pkiSyncWithCredentials, certificateMap, {
        certificateSyncDAL,
        gatewayV2Service,
        gatewayPoolService
      });
      if (!result) return;

      if (didPreflightCheckFail(result)) {
        logger.warn(
          `cron[${CronJobName.PkiSyncPreflightCheck}]: preflight check failed [syncId=${syncId}] [destination=${pkiSync.destination}] [projectId=${pkiSync.projectId}]`
        );
        await pkiSyncDAL.updateById(syncId, {
          syncStatus: PkiSyncStatus.Failed,
          lastSyncMessage: truncateSyncMessage(buildPreflightCommandFailureMessage(result))
        });
      }
    } finally {
      await lock.release();
    }

    await auditLogService.createAuditLog({
      projectId: pkiSync.projectId,
      actor: { type: ActorType.PLATFORM, metadata: {} },
      event: {
        type: EventType.PKI_SYNC_PREFLIGHT_CHECK,
        metadata: { syncId, command, ranAt: new Date(), result }
      }
    });
  };

  const init = () => {
    queueService.start(
      QueueName.PkiSyncPreflightCheck,
      async (job) => {
        await $processPreflightCheck(job.data.syncId);
      },
      { concurrency: WORKER_CONCURRENCY, limiter: { max: RATE_LIMIT_MAX, duration: RATE_LIMIT_DURATION_MS } }
    );

    cronJob.register({
      name: CronJobName.PkiSyncPreflightCheck,
      pattern: "* * * * *",
      runHashTtlS: 3 * 24 * 60 * 60,
      handlerTimeoutMs: CRON_HANDLER_TIMEOUT_MS,
      leaseDurationMs: CRON_HANDLER_TIMEOUT_MS,
      enabled: !appCfg.isSecondaryInstance,
      handler: async () => {
        const total = await pkiSyncDAL.countPkiSyncsWithPreflightCommand();
        lastDiscoveryCount = total;
        if (total === 0) return;

        // A tick may only enqueue what the fleet can drain in a day. A set larger than that is walked
        // in consecutive windows so every sync is eventually checked, rather than re-checking the same
        // head every day while the tail is never checked at all.
        const windowCount = Math.ceil(total / DISCOVERY_BATCH);
        const window = Math.floor(Date.now() / DAY_MS) % windowCount;
        const dueSyncs = await pkiSyncDAL.findPkiSyncsWithPreflightCommand(DISCOVERY_BATCH, window * DISCOVERY_BATCH);
        if (dueSyncs.length === 0) return;

        if (windowCount > 1) {
          logger.warn(
            `cron[${CronJobName.PkiSyncPreflightCheck}]: ${total} syncs have a check but only ${DISCOVERY_BATCH} can run in a day, so each is checked every ${windowCount} days [window=${window + 1}/${windowCount}]`
          );
        }

        logger.info(`cron[${CronJobName.PkiSyncPreflightCheck}]: enqueuing ${dueSyncs.length} preflight check(s)`);
        await Promise.all(
          dueSyncs.map((pkiSync) =>
            queueService.queue(
              QueueName.PkiSyncPreflightCheck,
              QueueJobs.PkiSyncRunPreflightCheck,
              { syncId: pkiSync.id },
              {
                jobId: `pki-sync-preflight-check-${pkiSync.id}`,
                removeOnComplete: true,
                removeOnFail: true,
                attempts: 1
              }
            )
          )
        );
      }
    });
  };

  return { init };
};
