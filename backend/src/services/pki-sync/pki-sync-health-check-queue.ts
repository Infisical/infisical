import { AuditLogInfo, EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { resolveCoreMeter } from "@app/lib/telemetry/metrics";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { decryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
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
import {
  PKI_SYNC_CONNECTION_CONCURRENCY_LIMIT,
  PKI_SYNC_CONNECTION_CONCURRENCY_TTL_S,
  PKI_SYNC_CONNECTION_LOCK_RETRY,
  PkiSync,
  PkiSyncStatus
} from "./pki-sync-enums";
import { PkiSyncFns, truncateSyncMessage } from "./pki-sync-fns";
import {
  assertHealthCheckCommandIsTestable,
  buildHealthCheckFailureMessageFor,
  didHealthCheckFail,
  getHealthCheckCommand,
  HEALTH_CHECK_OWNED_MESSAGE_SUBJECTS,
  MANUAL_HEALTH_CHECK_MESSAGE_SUBJECT,
  SCHEDULED_HEALTH_CHECK_MESSAGE_SUBJECT,
  THealthCheckCommandResult
} from "./pki-sync-health-check-command-fns";
import {
  commandNeedsCertificateData,
  findCertificateDependentHostCommandVariables,
  formatHostCommandVariables
} from "./pki-sync-host-command-fns";
import { TCertificateMap, THealthCheckTarget, TPkiSyncRaw } from "./pki-sync-types";

const ENQUEUE_CHUNK_SIZE = 200;
const WORKER_CONCURRENCY = 3;

const JOB_ATTEMPTS = 3;
const JOB_BACKOFF_DELAY_MS = 30_000;
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_DURATION_MS = 60 * 1000;

const CRON_HANDLER_TIMEOUT_MS = 60 * 1000;

const HEALTH_CHECK_LOCK_TTL_MS = 60 * 1000;

type TPkiSyncHealthCheckQueueFactoryDep = {
  cronJob: TCronJobFactory;
  queueService: Pick<TQueueServiceFactory, "queue" | "start">;
  pkiSyncDAL: Pick<
    TPkiSyncDALFactory,
    | "findPkiSyncsWithHealthCheckCommand"
    | "transaction"
    | "recordHealthCheckOutcome"
    | "reportHealthCheckFailure"
    | "clearReportedHealthCheckFailure"
    | "findById"
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

class HealthCheckBusyError extends Error {}

export type TPkiSyncHealthCheckQueueFactory = ReturnType<typeof pkiSyncHealthCheckQueueFactory>;

export const pkiSyncHealthCheckQueueFactory = ({
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
}: TPkiSyncHealthCheckQueueFactoryDep) => {
  const appCfg = getConfig();

  const meter = resolveCoreMeter();
  let lastDiscoveryCount = 0;
  const discoveryGauge = meter.createObservableGauge("infisical.pki_sync_health_check.discovered", {
    description: "PKI syncs with a health check configured, enqueued on the last daily tick.",
    unit: "{sync}"
  });
  discoveryGauge.addCallback((observableResult) => {
    if (!getConfig().OTEL_TELEMETRY_COLLECTION_ENABLED) return;
    observableResult.observe(lastDiscoveryCount);
  });

  const $withConnectionHostAccess = async <T>(connectionId: string, run: () => Promise<T>): Promise<T> => {
    const connectionLock = await keyStore
      .acquireLock(
        [KeyStorePrefixes.AppConnectionCommandLock(connectionId)],
        HEALTH_CHECK_LOCK_TTL_MS,
        PKI_SYNC_CONNECTION_LOCK_RETRY
      )
      .catch(() => null);
    if (!connectionLock) {
      throw new HealthCheckBusyError("This connection is busy running another command.");
    }

    let admittedSlot = false;
    try {
      admittedSlot =
        (await keyStore.incrementByAndRefreshExpiryIfUnderLimit(
          KeyStorePrefixes.AppConnectionConcurrentJobs(connectionId),
          PKI_SYNC_CONNECTION_CONCURRENCY_LIMIT,
          PKI_SYNC_CONNECTION_CONCURRENCY_TTL_S
        )) !== -1;
      if (!admittedSlot) {
        throw new HealthCheckBusyError("This connection is at its concurrency limit.");
      }

      return await run();
    } finally {
      await Promise.allSettled([
        admittedSlot
          ? keyStore.decrementByOrDelete(KeyStorePrefixes.AppConnectionConcurrentJobs(connectionId))
          : undefined,
        connectionLock.release()
      ]);
    }
  };

  const $rethrowContentionAsBadRequest = (error: unknown): never => {
    if (error instanceof HealthCheckBusyError) {
      throw new BadRequestError({ message: `${error.message} Try again in a moment.` });
    }

    throw error;
  };

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

  const $recordCheckResult = async (
    pkiSync: TPkiSyncRaw,
    result: THealthCheckCommandResult,
    isFinalAttempt: boolean,
    messageSubject: string
  ) => {
    if (!didHealthCheckFail(result)) {
      const cleared = await pkiSyncDAL.transaction(async (tx) => {
        await pkiSyncDAL.recordHealthCheckOutcome(
          pkiSync.id,
          { status: PkiSyncStatus.Succeeded, message: null, ranAt: new Date() },
          tx
        );

        return pkiSyncDAL.clearReportedHealthCheckFailure(pkiSync.id, HEALTH_CHECK_OWNED_MESSAGE_SUBJECTS, tx);
      });
      if (cleared) {
        logger.info(
          `cron[${CronJobName.PkiSyncHealthCheck}]: host recovered, cleared the reported failure [syncId=${pkiSync.id}]`
        );
      }
      return;
    }

    if (result.exitCode === undefined && !isFinalAttempt) {
      throw new Error(`Health check could not reach the host: ${result.error ?? "unknown error"}`);
    }

    logger.warn(
      `cron[${CronJobName.PkiSyncHealthCheck}]: health check failed [syncId=${pkiSync.id}] [destination=${pkiSync.destination}] [projectId=${pkiSync.projectId}]`
    );

    const failureMessage = truncateSyncMessage(buildHealthCheckFailureMessageFor(messageSubject, result));

    const reported = await pkiSyncDAL.transaction(async (tx) => {
      await pkiSyncDAL.recordHealthCheckOutcome(
        pkiSync.id,
        { status: PkiSyncStatus.Failed, message: failureMessage, ranAt: new Date() },
        tx
      );

      return pkiSyncDAL.reportHealthCheckFailure(pkiSync.id, failureMessage, HEALTH_CHECK_OWNED_MESSAGE_SUBJECTS, tx);
    });
    if (!reported) {
      logger.info(
        `cron[${CronJobName.PkiSyncHealthCheck}]: sync already failed to deliver, kept its reason [syncId=${pkiSync.id}]`
      );
    }
  };

  const $processHealthCheck = async (
    syncId: string,
    isFinalAttempt: boolean,
    messageSubject: string = SCHEDULED_HEALTH_CHECK_MESSAGE_SUBJECT,
    auditLogInfo?: AuditLogInfo
  ): Promise<THealthCheckCommandResult | undefined> => {
    const pkiSync = await pkiSyncDAL.findById(syncId);
    if (!pkiSync) {
      logger.info(`cron[${CronJobName.PkiSyncHealthCheck}]: sync is gone, skipping [syncId=${syncId}]`);
      return;
    }

    const command = getHealthCheckCommand(pkiSync.syncOptions);
    if (!command) {
      logger.info(
        `cron[${CronJobName.PkiSyncHealthCheck}]: health check command was cleared, skipping [syncId=${syncId}]`
      );
      return;
    }

    if (pkiSync.syncStatus === PkiSyncStatus.Running) {
      logger.info(
        `cron[${CronJobName.PkiSyncHealthCheck}]: a sync is delivering to this host, skipping [syncId=${syncId}]`
      );
      return undefined;
    }

    const pkiSyncWithCredentials = await hydratePkiSyncCredentials({
      pkiSync,
      appConnectionDAL,
      projectDAL,
      kmsService
    });

    const certificateMap = await $certificatesForCheck(pkiSync, command);

    const result = await $withConnectionHostAccess(pkiSync.connectionId, async () => {
      const lock = await keyStore
        .acquireLock([KeyStorePrefixes.PkiSyncLock(syncId)], HEALTH_CHECK_LOCK_TTL_MS)
        .catch(() => null);
      if (!lock) {
        logger.info(`cron[${CronJobName.PkiSyncHealthCheck}]: a sync is already running, skipping [syncId=${syncId}]`);
        return undefined;
      }

      try {
        const checkResult = await PkiSyncFns.runHealthCheck(pkiSyncWithCredentials, certificateMap, {
          certificateSyncDAL,
          gatewayV2Service,
          gatewayPoolService
        });
        if (!checkResult) return undefined;

        await $recordCheckResult(pkiSync, checkResult, isFinalAttempt, messageSubject);
        return checkResult;
      } finally {
        await lock.release();
      }
    });

    if (!result) return undefined;

    await auditLogService.createAuditLog({
      ...(auditLogInfo ?? { actor: { type: ActorType.PLATFORM, metadata: {} } }),
      projectId: pkiSync.projectId,
      event: {
        type: EventType.PKI_SYNC_HEALTH_CHECK,
        metadata: {
          syncId,
          syncName: pkiSync.name,
          destination: pkiSync.destination,
          command,
          result
        }
      }
    });

    return result;
  };

  const runHealthCheckNow = async (syncId: string, auditLogInfo?: AuditLogInfo) => {
    let result: THealthCheckCommandResult | undefined;

    try {
      result = await $processHealthCheck(syncId, true, MANUAL_HEALTH_CHECK_MESSAGE_SUBJECT, auditLogInfo);
    } catch (error) {
      $rethrowContentionAsBadRequest(error);
    }

    if (result) return result;

    const pkiSync = await pkiSyncDAL.findById(syncId);
    const command = getHealthCheckCommand(pkiSync?.syncOptions);
    if (command && commandNeedsCertificateData(command)) {
      throw new BadRequestError({
        message: `This health check uses ${formatHostCommandVariables(
          findCertificateDependentHostCommandVariables(command)
        )}, which cannot be resolved while no certificate is linked to the sync. Link a certificate, or use {{certificateDirectory}}.`
      });
    }

    throw new BadRequestError({
      message: "The health check did not run because a sync is already in progress. Try again in a moment."
    });
  };

  const testHealthCheckCommand = async (args: {
    destination: PkiSync;
    connectionId: string;
    destinationConfig: Record<string, unknown>;
    syncOptions: Record<string, unknown>;
  }) => {
    assertHealthCheckCommandIsTestable(args.syncOptions);

    const connection = await appConnectionDAL.findById(args.connectionId);
    if (!connection) {
      throw new NotFoundError({ message: `App connection with ID '${args.connectionId}' not found` });
    }

    const credentials = await decryptAppConnectionCredentials({
      orgId: connection.orgId,
      projectId: connection.projectId,
      encryptedCredentials: connection.encryptedCredentials,
      kmsService
    });

    const target: THealthCheckTarget = {
      id: "unsaved-sync-test",
      destination: args.destination,
      destinationConfig: args.destinationConfig,
      syncOptions: args.syncOptions,
      connection: {
        id: connection.id,
        name: connection.name,
        app: connection.app,
        credentials: credentials as Record<string, unknown>,
        method: connection.method,
        orgId: connection.orgId,
        gatewayId: connection.gatewayId ?? undefined,
        gatewayPoolId: connection.gatewayPoolId
      }
    };

    return $withConnectionHostAccess(connection.id, async () => {
      const result = await PkiSyncFns.runHealthCheck(
        target,
        {},
        {
          certificateSyncDAL,
          gatewayV2Service,
          gatewayPoolService
        }
      );
      if (!result) {
        throw new BadRequestError({
          message: "Health checks are not supported for this destination."
        });
      }

      return result;
    }).catch($rethrowContentionAsBadRequest);
  };

  const init = () => {
    queueService.start(
      QueueName.PkiSyncHealthCheck,
      async (job) => {
        const isFinalAttempt = job.attemptsStarted >= (job.opts.attempts ?? JOB_ATTEMPTS);

        await $processHealthCheck(job.data.syncId, isFinalAttempt).catch((err: unknown) => {
          logger.error(
            { err, syncId: job.data.syncId },
            `cron[${CronJobName.PkiSyncHealthCheck}]: check could not be run [syncId=${job.data.syncId}] [attempt=${job.attemptsStarted}]`
          );
          throw err;
        });
      },
      { concurrency: WORKER_CONCURRENCY, limiter: { max: RATE_LIMIT_MAX, duration: RATE_LIMIT_DURATION_MS } }
    );

    cronJob.register({
      name: CronJobName.PkiSyncHealthCheck,
      pattern: "23 3 * * *",
      runHashTtlS: 3 * 24 * 60 * 60,
      handlerTimeoutMs: CRON_HANDLER_TIMEOUT_MS,
      leaseDurationMs: CRON_HANDLER_TIMEOUT_MS,
      enabled: !appCfg.isSecondaryInstance,
      handler: async () => {
        const dueSyncs = await pkiSyncDAL.findPkiSyncsWithHealthCheckCommand();
        lastDiscoveryCount = dueSyncs.length;
        if (dueSyncs.length === 0) return;

        logger.info(`cron[${CronJobName.PkiSyncHealthCheck}]: enqueuing ${dueSyncs.length} health check(s)`);

        for (let offset = 0; offset < dueSyncs.length; offset += ENQUEUE_CHUNK_SIZE) {
          // eslint-disable-next-line no-await-in-loop
          await Promise.all(
            dueSyncs.slice(offset, offset + ENQUEUE_CHUNK_SIZE).map((pkiSync) =>
              queueService.queue(
                QueueName.PkiSyncHealthCheck,
                QueueJobs.PkiSyncRunHealthCheck,
                { syncId: pkiSync.id },
                {
                  jobId: `pki-sync-health-check-${pkiSync.id}`,
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

  return { init, runHealthCheckNow, testHealthCheckCommand };
};
