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
import { PKI_SYNC_CONNECTION_CONCURRENCY_LIMIT } from "./pki-sync-enums";
import { PkiSyncFns, truncateSyncMessage } from "./pki-sync-fns";
import { commandNeedsCertificateData } from "./pki-sync-host-command-fns";
import {
  buildScheduledPreflightFailureMessage,
  didPreflightCheckFail,
  getPreflightCommand,
  SCHEDULED_PREFLIGHT_FAILURE_PREFIX,
  TPreflightCommandResult
} from "./pki-sync-preflight-command-fns";
import { TCertificateMap, TPkiSyncRaw } from "./pki-sync-types";

const ENQUEUE_CHUNK_SIZE = 200;
const WORKER_CONCURRENCY = 3;

const JOB_ATTEMPTS = 3;
const JOB_BACKOFF_DELAY_MS = 30_000;
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_DURATION_MS = 60 * 1000;

const CRON_HANDLER_TIMEOUT_MS = 60 * 1000;

const PREFLIGHT_LOCK_TTL_MS = 60 * 1000;

const CONNECTION_SLOT_TTL_S = 5 * 60;

const CONNECTION_LOCK_RETRY = { retryCount: 10, retryDelay: 3_000, retryJitter: 500 };

type TPkiSyncPreflightQueueFactoryDep = {
  cronJob: TCronJobFactory;
  queueService: Pick<TQueueServiceFactory, "queue" | "start">;
  pkiSyncDAL: Pick<
    TPkiSyncDALFactory,
    "findPkiSyncsWithPreflightCommand" | "reportPreflightFailure" | "clearReportedPreflightFailure" | "findById"
  >;
  keyStore: Pick<TKeyStoreFactory, "acquireLock" | "incrementByAndRefreshExpiryIfUnderLimit" | "decrementByOrDelete">;
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
    description: "PKI syncs with a preflight check configured, enqueued on the last daily tick.",
    unit: "{sync}"
  });
  discoveryGauge.addCallback((observableResult) => {
    if (!getConfig().OTEL_TELEMETRY_COLLECTION_ENABLED) return;
    observableResult.observe(lastDiscoveryCount);
  });

  const $certificatesForCheck = async (pkiSync: TPkiSyncRaw, command: string): Promise<TCertificateMap> => {
    if (!commandNeedsCertificateData(command)) return {};

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

    return certificateMap;
  };

  const $recordCheckResult = async (pkiSync: TPkiSyncRaw, result: TPreflightCommandResult, isFinalAttempt: boolean) => {
    if (!didPreflightCheckFail(result)) {
      const cleared = await pkiSyncDAL.clearReportedPreflightFailure(pkiSync.id, SCHEDULED_PREFLIGHT_FAILURE_PREFIX);
      if (cleared) {
        logger.info(
          `cron[${CronJobName.PkiSyncPreflightCheck}]: host recovered, cleared the reported failure [syncId=${pkiSync.id}]`
        );
      }
      return;
    }

    if (result.exitCode === undefined && !isFinalAttempt) {
      throw new Error(`Preflight check could not reach the host: ${result.error ?? "unknown error"}`);
    }

    logger.warn(
      `cron[${CronJobName.PkiSyncPreflightCheck}]: preflight check failed [syncId=${pkiSync.id}] [destination=${pkiSync.destination}] [projectId=${pkiSync.projectId}]`
    );

    const reported = await pkiSyncDAL.reportPreflightFailure(
      pkiSync.id,
      truncateSyncMessage(buildScheduledPreflightFailureMessage(result)),
      SCHEDULED_PREFLIGHT_FAILURE_PREFIX
    );
    if (!reported) {
      logger.info(
        `cron[${CronJobName.PkiSyncPreflightCheck}]: sync already failed to deliver, kept its reason [syncId=${pkiSync.id}]`
      );
    }
  };

  const $processPreflightCheck = async (syncId: string, isFinalAttempt: boolean) => {
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

    const certificateMap = await $certificatesForCheck(pkiSync, command);

    const connectionLock = await keyStore
      .acquireLock(
        [KeyStorePrefixes.AppConnectionCommandLock(pkiSync.connectionId)],
        PREFLIGHT_LOCK_TTL_MS,
        CONNECTION_LOCK_RETRY
      )
      .catch(() => null);
    if (!connectionLock) {
      logger.info(
        `cron[${CronJobName.PkiSyncPreflightCheck}]: connection still busy after waiting, deferring to the next run [syncId=${syncId}] [connectionId=${pkiSync.connectionId}]`
      );
      return;
    }

    let lock: Awaited<ReturnType<typeof keyStore.acquireLock>> | null = null;
    let admittedSlot = false;
    let result;
    try {
      admittedSlot =
        (await keyStore.incrementByAndRefreshExpiryIfUnderLimit(
          KeyStorePrefixes.AppConnectionConcurrentJobs(pkiSync.connectionId),
          PKI_SYNC_CONNECTION_CONCURRENCY_LIMIT,
          CONNECTION_SLOT_TTL_S
        )) !== -1;
      if (!admittedSlot) {
        logger.info(
          `cron[${CronJobName.PkiSyncPreflightCheck}]: connection is at its concurrency limit, skipping [syncId=${syncId}]`
        );
        return;
      }

      lock = await keyStore
        .acquireLock([KeyStorePrefixes.PkiSyncLock(syncId)], PREFLIGHT_LOCK_TTL_MS)
        .catch(() => null);
      if (!lock) {
        logger.info(
          `cron[${CronJobName.PkiSyncPreflightCheck}]: a sync is already running, skipping [syncId=${syncId}]`
        );
        return;
      }

      result = await PkiSyncFns.runPreflightCheck(pkiSyncWithCredentials, certificateMap, {
        certificateSyncDAL,
        gatewayV2Service,
        gatewayPoolService
      });
      if (!result) return;

      await $recordCheckResult(pkiSync, result, isFinalAttempt);
    } finally {
      await Promise.allSettled([
        admittedSlot
          ? keyStore.decrementByOrDelete(KeyStorePrefixes.AppConnectionConcurrentJobs(pkiSync.connectionId))
          : undefined,
        lock?.release(),
        connectionLock.release()
      ]);
    }

    await auditLogService.createAuditLog({
      projectId: pkiSync.projectId,
      actor: { type: ActorType.PLATFORM, metadata: {} },
      event: {
        type: EventType.PKI_SYNC_PREFLIGHT_CHECK,
        metadata: {
          syncId,
          syncName: pkiSync.name,
          destination: pkiSync.destination,
          command,
          ranAt: new Date(),
          result
        }
      }
    });
  };

  const init = () => {
    queueService.start(
      QueueName.PkiSyncPreflightCheck,
      async (job) => {
        const isFinalAttempt = job.attemptsStarted >= (job.opts.attempts ?? JOB_ATTEMPTS);

        await $processPreflightCheck(job.data.syncId, isFinalAttempt).catch((err: unknown) => {
          logger.error(
            { err, syncId: job.data.syncId },
            `cron[${CronJobName.PkiSyncPreflightCheck}]: check could not be run [syncId=${job.data.syncId}] [attempt=${job.attemptsStarted}]`
          );
          throw err;
        });
      },
      { concurrency: WORKER_CONCURRENCY, limiter: { max: RATE_LIMIT_MAX, duration: RATE_LIMIT_DURATION_MS } }
    );

    cronJob.register({
      name: CronJobName.PkiSyncPreflightCheck,
      pattern: "23 3 * * *",
      runHashTtlS: 3 * 24 * 60 * 60,
      handlerTimeoutMs: CRON_HANDLER_TIMEOUT_MS,
      leaseDurationMs: CRON_HANDLER_TIMEOUT_MS,
      enabled: !appCfg.isSecondaryInstance,
      handler: async () => {
        const dueSyncs = await pkiSyncDAL.findPkiSyncsWithPreflightCommand();
        lastDiscoveryCount = dueSyncs.length;
        if (dueSyncs.length === 0) return;

        logger.info(`cron[${CronJobName.PkiSyncPreflightCheck}]: enqueuing ${dueSyncs.length} preflight check(s)`);

        for (let offset = 0; offset < dueSyncs.length; offset += ENQUEUE_CHUNK_SIZE) {
          // eslint-disable-next-line no-await-in-loop
          await Promise.all(
            dueSyncs.slice(offset, offset + ENQUEUE_CHUNK_SIZE).map((pkiSync) =>
              queueService.queue(
                QueueName.PkiSyncPreflightCheck,
                QueueJobs.PkiSyncRunPreflightCheck,
                { syncId: pkiSync.id },
                {
                  jobId: `pki-sync-preflight-check-${pkiSync.id}`,
                  removeOnComplete: true,
                  removeOnFail: true,
                  attempts: JOB_ATTEMPTS,
                  backoff: { type: "exponential", delay: JOB_BACKOFF_DELAY_MS }
                }
              )
            )
          );
        }
      }
    });
  };

  return { init };
};
