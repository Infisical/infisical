import { TAuditLogDALFactory } from "@app/ee/services/audit-log/audit-log-dal";
import { TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TScepTransactionDALFactory } from "@app/ee/services/pki-scep/pki-scep-transaction-dal";
import { TScimServiceFactory } from "@app/ee/services/scim/scim-types";
import { TSnapshotDALFactory } from "@app/ee/services/secret-snapshot/snapshot-dal";
import { TKeyValueStoreDALFactory } from "@app/keystore/key-value-store-dal";
import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";
import { TUserNotificationDALFactory } from "@app/services/notification/user-notification-dal";

import { TApprovalRequestDALFactory, TApprovalRequestGrantsDALFactory } from "../approval-policy/approval-request-dal";
import { TCertificateRequestDALFactory } from "../certificate-request/certificate-request-dal";
import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";
import { TIdentityAccessTokenRevocationDALFactory } from "../identity-access-token/identity-access-token-revocation-dal";
import { TIdentityUaClientSecretDALFactory } from "../identity-ua/identity-ua-client-secret-dal";
import { TOrgServiceFactory } from "../org/org-service";
import { TSecretVersionDALFactory } from "../secret/secret-version-dal";
import { TSecretFolderVersionDALFactory } from "../secret-folder/secret-folder-version-dal";
import { TSecretSharingDALFactory } from "../secret-sharing/secret-sharing-dal";
import { TSecretVersionV2DALFactory } from "../secret-v2-bridge/secret-version-dal";
import { TServiceTokenServiceFactory } from "../service-token/service-token-service";

type TDailyResourceCleanUpQueueServiceFactoryDep = {
  auditLogDAL: Pick<TAuditLogDALFactory, "pruneAuditLog">;
  auditLogService: Pick<TAuditLogServiceFactory, "checkPostgresAuditLogVolumeMigrationAlert">;
  identityAccessTokenDAL: Pick<TIdentityAccessTokenDALFactory, "removeExpiredTokens">;
  identityAccessTokenRevocationDAL: Pick<TIdentityAccessTokenRevocationDALFactory, "removeExpiredRevocations">;
  identityUniversalAuthClientSecretDAL: Pick<TIdentityUaClientSecretDALFactory, "removeExpiredClientSecrets">;
  secretVersionDAL: Pick<TSecretVersionDALFactory, "pruneExcessVersions">;
  secretVersionV2DAL: Pick<TSecretVersionV2DALFactory, "pruneExcessVersions" | "pruneOrphanedVersions">;
  secretFolderVersionDAL: Pick<TSecretFolderVersionDALFactory, "pruneExcessVersions">;
  snapshotDAL: Pick<TSnapshotDALFactory, "pruneExcessSnapshots">;
  secretSharingDAL: Pick<TSecretSharingDALFactory, "pruneExpiredSharedSecrets" | "pruneExpiredSecretRequests">;
  serviceTokenService: Pick<TServiceTokenServiceFactory, "notifyExpiringTokens">;
  cronJob: TCronJobFactory;
  orgService: TOrgServiceFactory;
  userNotificationDAL: Pick<TUserNotificationDALFactory, "pruneNotifications">;
  keyValueStoreDAL: Pick<TKeyValueStoreDALFactory, "pruneExpiredKeys">;
  scimService: Pick<TScimServiceFactory, "notifyExpiringTokens">;
  approvalRequestDAL: Pick<TApprovalRequestDALFactory, "markExpiredRequests">;
  approvalRequestGrantsDAL: Pick<TApprovalRequestGrantsDALFactory, "markExpiredGrants">;
  certificateRequestDAL: Pick<TCertificateRequestDALFactory, "markExpiredApprovalRequests">;
  scepTransactionDAL: Pick<TScepTransactionDALFactory, "pruneExpiredTransactions">;
};

export type TDailyResourceCleanUpQueueServiceFactory = ReturnType<typeof dailyResourceCleanUpQueueServiceFactory>;

export const dailyResourceCleanUpQueueServiceFactory = ({
  auditLogDAL,
  auditLogService,
  cronJob,
  snapshotDAL,
  secretVersionDAL,
  secretFolderVersionDAL,
  secretSharingDAL,
  secretVersionV2DAL,
  identityAccessTokenDAL,
  identityAccessTokenRevocationDAL,
  identityUniversalAuthClientSecretDAL,
  serviceTokenService,
  scimService,
  orgService,
  userNotificationDAL,
  keyValueStoreDAL,
  approvalRequestDAL,
  approvalRequestGrantsDAL,
  certificateRequestDAL,
  scepTransactionDAL
}: TDailyResourceCleanUpQueueServiceFactoryDep) => {
  const appCfg = getConfig();

  if (appCfg.isDailyResourceCleanUpDevelopmentMode) {
    logger.warn("Daily Resource Clean Up is in development mode.");
  }

  const init = () => {
    const devMode = appCfg.isDailyResourceCleanUpDevelopmentMode;

    const heavyCleanupTimeoutMs = devMode ? 5 * 60_000 : 45 * 60_000;
    const lightCleanupTimeoutMs = devMode ? 5 * 60_000 : 15 * 60_000;
    const dailyNotificationTimeoutMs = devMode ? 5 * 60_000 : 15 * 60_000;
    const frequentCleanupTimeoutMs = devMode ? 5 * 60_000 : 10 * 60_000;

    // When audit logs are written to ClickHouse, Postgres audit logs stop growing and are no
    // longer read, so the Postgres prune cron has nothing to do — and cannot drain the frozen
    // pre-cutover backlog within its timeout, causing a nightly terminal failure. Skip it here
    // (Postgres cleanup is handled out-of-band by dropping old partitions). This mirrors the
    // write-path condition in audit-log-queue.ts so pruning stays enabled if ClickHouse inserts
    // are turned off while CLICKHOUSE_URL is still set.
    const isClickHouseAuditLogEnabled = appCfg.isClickHouseConfigured && appCfg.CLICKHOUSE_AUDIT_LOG_ENABLED;

    cronJob.register({
      name: CronJobName.DailyResourceCleanup,
      pattern: devMode ? "*/5 * * * *" : "30 0 * * *",
      runHashTtlS: 3 * 24 * 60 * 60,
      handlerTimeoutMs: lightCleanupTimeoutMs,
      leaseDurationMs: lightCleanupTimeoutMs,
      enabled: !appCfg.isSecondaryInstance,
      handler: async () => {
        logger.info(`cron[${CronJobName.DailyResourceCleanup}]: task started`);
        await identityUniversalAuthClientSecretDAL.removeExpiredClientSecrets();
        await secretSharingDAL.pruneExpiredSharedSecrets();
        await secretSharingDAL.pruneExpiredSecretRequests();
        await userNotificationDAL.pruneNotifications();
        await keyValueStoreDAL.pruneExpiredKeys();
        await scepTransactionDAL.pruneExpiredTransactions();
        await identityAccessTokenRevocationDAL.removeExpiredRevocations();
      }
    });

    cronJob.register({
      name: CronJobName.DailySecretVersionCleanup,
      pattern: devMode ? "*/5 * * * *" : "30 1 * * *",
      runHashTtlS: 3 * 24 * 60 * 60,
      handlerTimeoutMs: heavyCleanupTimeoutMs,
      leaseDurationMs: heavyCleanupTimeoutMs,
      enabled: !appCfg.isSecondaryInstance,
      handler: async () => {
        logger.info(`cron[${CronJobName.DailySecretVersionCleanup}]: task started`);
        await secretVersionV2DAL.pruneOrphanedVersions();
        await secretVersionDAL.pruneExcessVersions();
        await secretVersionV2DAL.pruneExcessVersions();
        await secretFolderVersionDAL.pruneExcessVersions();
      }
    });

    cronJob.register({
      name: CronJobName.DailySnapshotCleanup,
      pattern: devMode ? "*/5 * * * *" : "30 2 * * *",
      runHashTtlS: 3 * 24 * 60 * 60,
      handlerTimeoutMs: heavyCleanupTimeoutMs,
      leaseDurationMs: heavyCleanupTimeoutMs,
      enabled: !appCfg.isSecondaryInstance,
      handler: async () => {
        logger.info(`cron[${CronJobName.DailySnapshotCleanup}]: task started`);
        await snapshotDAL.pruneExcessSnapshots();
      }
    });

    cronJob.register({
      name: CronJobName.DailyAuditLogCleanup,
      pattern: devMode ? "*/5 * * * *" : "30 3 * * *",
      runHashTtlS: 3 * 24 * 60 * 60,
      handlerTimeoutMs: heavyCleanupTimeoutMs,
      leaseDurationMs: heavyCleanupTimeoutMs,
      enabled: !appCfg.isSecondaryInstance && !isClickHouseAuditLogEnabled,
      handler: async () => {
        logger.info(`cron[${CronJobName.DailyAuditLogCleanup}]: task started`);
        await auditLogDAL.pruneAuditLog();
      }
    });

    cronJob.register({
      name: CronJobName.DailyResourceNotification,
      pattern: devMode ? "*/5 * * * *" : "0 0 * * *",
      runHashTtlS: 3 * 24 * 60 * 60,
      handlerTimeoutMs: dailyNotificationTimeoutMs,
      leaseDurationMs: dailyNotificationTimeoutMs,
      enabled: !appCfg.isSecondaryInstance,
      handler: async () => {
        logger.info(`cron[${CronJobName.DailyResourceNotification}]: task started`);
        await serviceTokenService.notifyExpiringTokens();
        await scimService.notifyExpiringTokens();
        await orgService.notifyInvitedUsers();
        await auditLogService.checkPostgresAuditLogVolumeMigrationAlert();
      }
    });

    cronJob.register({
      name: CronJobName.FrequentResourceCleanup,
      pattern: devMode ? "*/5 * * * *" : "0 * * * *",
      runHashTtlS: 1 * 24 * 60 * 60,
      enabled: !appCfg.isSecondaryInstance,
      handlerTimeoutMs: frequentCleanupTimeoutMs,
      leaseDurationMs: frequentCleanupTimeoutMs,
      handler: async () => {
        logger.info(`cron[${CronJobName.FrequentResourceCleanup}]: task started`);
        await identityAccessTokenDAL.removeExpiredTokens();
        const newlyExpired = await approvalRequestDAL.markExpiredRequests();
        if (newlyExpired > 0) {
          await certificateRequestDAL.markExpiredApprovalRequests();
        }
        await approvalRequestGrantsDAL.markExpiredGrants();
      }
    });
  };

  return {
    init
  };
};
