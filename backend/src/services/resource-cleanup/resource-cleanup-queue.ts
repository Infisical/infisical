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
  secretVersionV2DAL: Pick<TSecretVersionV2DALFactory, "pruneExcessVersions">;
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
    const dailyCleanupTimeoutMs = appCfg.isDailyResourceCleanUpDevelopmentMode ? 5 * 60_000 : 45 * 60_000;
    const dailyNotificationTimeoutMs = appCfg.isDailyResourceCleanUpDevelopmentMode ? 5 * 60_000 : 15 * 60_000;
    const frequentCleanupTimeoutMs = appCfg.isDailyResourceCleanUpDevelopmentMode ? 5 * 60_000 : 10 * 60_000;
    cronJob.register({
      name: CronJobName.DailyResourceCleanup,
      pattern: appCfg.isDailyResourceCleanUpDevelopmentMode ? "*/5 * * * *" : "0 0 * * *",
      runHashTtlS: 3 * 24 * 60 * 60,
      handlerTimeoutMs: dailyCleanupTimeoutMs,
      leaseDurationMs: dailyCleanupTimeoutMs,
      enabled: !appCfg.isSecondaryInstance,
      handler: async () => {
        logger.info(`cron[${CronJobName.DailyResourceCleanup}]: task started`);
        await identityUniversalAuthClientSecretDAL.removeExpiredClientSecrets();
        await secretSharingDAL.pruneExpiredSharedSecrets();
        await secretSharingDAL.pruneExpiredSecretRequests();
        await snapshotDAL.pruneExcessSnapshots();
        await secretVersionDAL.pruneExcessVersions();
        await secretVersionV2DAL.pruneExcessVersions();
        await secretFolderVersionDAL.pruneExcessVersions();
        await userNotificationDAL.pruneNotifications();
        await keyValueStoreDAL.pruneExpiredKeys();
        await scepTransactionDAL.pruneExpiredTransactions();
        await auditLogDAL.pruneAuditLog();
      }
    });

    cronJob.register({
      name: CronJobName.DailyResourceNotification,
      pattern: appCfg.isDailyResourceCleanUpDevelopmentMode ? "*/5 * * * *" : "0 0 * * *",
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
      pattern: appCfg.isDailyResourceCleanUpDevelopmentMode ? "*/5 * * * *" : "0 * * * *",
      runHashTtlS: 1 * 24 * 60 * 60,
      enabled: !appCfg.isSecondaryInstance,
      handlerTimeoutMs: frequentCleanupTimeoutMs,
      leaseDurationMs: frequentCleanupTimeoutMs,
      handler: async () => {
        logger.info(`cron[${CronJobName.FrequentResourceCleanup}]: task started`);
        await identityAccessTokenDAL.removeExpiredTokens();
        const deletedRevocations = await identityAccessTokenRevocationDAL.removeExpiredRevocations();
        logger.info(
          `cron[${CronJobName.FrequentResourceCleanup}]: removed ${deletedRevocations} expired identity access token revocations`
        );
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
