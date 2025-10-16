import { TAuditLogDALFactory } from "@app/ee/services/audit-log/audit-log-dal";
import { TSnapshotDALFactory } from "@app/ee/services/secret-snapshot/snapshot-dal";
import { TKeyValueStoreDALFactory } from "@app/keystore/key-value-store-dal";
import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TUserNotificationDALFactory } from "@app/services/notification/user-notification-dal";

import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";
import { TIdentityUaClientSecretDALFactory } from "../identity-ua/identity-ua-client-secret-dal";
import { TOrgServiceFactory } from "../org/org-service";
import { TSecretVersionDALFactory } from "../secret/secret-version-dal";
import { TSecretFolderVersionDALFactory } from "../secret-folder/secret-folder-version-dal";
import { TSecretSharingDALFactory } from "../secret-sharing/secret-sharing-dal";
import { TSecretVersionV2DALFactory } from "../secret-v2-bridge/secret-version-dal";
import { TServiceTokenServiceFactory } from "../service-token/service-token-service";

type TDailyResourceCleanUpQueueServiceFactoryDep = {
  auditLogDAL: Pick<TAuditLogDALFactory, "pruneAuditLog">;
  identityAccessTokenDAL: Pick<TIdentityAccessTokenDALFactory, "removeExpiredTokens">;
  identityUniversalAuthClientSecretDAL: Pick<TIdentityUaClientSecretDALFactory, "removeExpiredClientSecrets">;
  secretVersionDAL: Pick<TSecretVersionDALFactory, "pruneExcessVersions">;
  secretVersionV2DAL: Pick<TSecretVersionV2DALFactory, "pruneExcessVersions">;
  secretFolderVersionDAL: Pick<TSecretFolderVersionDALFactory, "pruneExcessVersions">;
  snapshotDAL: Pick<TSnapshotDALFactory, "pruneExcessSnapshots">;
  secretSharingDAL: Pick<TSecretSharingDALFactory, "pruneExpiredSharedSecrets" | "pruneExpiredSecretRequests">;
  serviceTokenService: Pick<TServiceTokenServiceFactory, "notifyExpiringTokens">;
  queueService: TQueueServiceFactory;
  orgService: TOrgServiceFactory;
  userNotificationDAL: Pick<TUserNotificationDALFactory, "pruneNotifications">;
  keyValueStoreDAL: Pick<TKeyValueStoreDALFactory, "pruneExpiredKeys">;
};

export type TDailyResourceCleanUpQueueServiceFactory = ReturnType<typeof dailyResourceCleanUpQueueServiceFactory>;

export const dailyResourceCleanUpQueueServiceFactory = ({
  auditLogDAL,
  queueService,
  snapshotDAL,
  secretVersionDAL,
  secretFolderVersionDAL,
  identityAccessTokenDAL,
  secretSharingDAL,
  secretVersionV2DAL,
  identityUniversalAuthClientSecretDAL,
  serviceTokenService,
  orgService,
  userNotificationDAL,
  keyValueStoreDAL
}: TDailyResourceCleanUpQueueServiceFactoryDep) => {
  const appCfg = getConfig();

  if (appCfg.isDailyResourceCleanUpDevelopmentMode) {
    logger.warn("Daily Resource Clean Up is in development mode.");
  }

  const init = async () => {
    if (appCfg.isSecondaryInstance) {
      return;
    }

    await queueService.stopRepeatableJob(
      QueueName.AuditLogPrune,
      QueueJobs.AuditLogPrune,
      { pattern: "0 0 * * *", utc: true },
      QueueName.AuditLogPrune // just a job id
    );
    await queueService.stopRepeatableJob(
      QueueName.DailyResourceCleanUp,
      QueueJobs.DailyResourceCleanUp,
      { pattern: "0 0 * * *", utc: true },
      QueueName.DailyResourceCleanUp // just a job id
    );

    await queueService.startPg<QueueName.DailyResourceCleanUp>(
      QueueJobs.DailyResourceCleanUp,
      async () => {
        try {
          logger.info(`${QueueName.DailyResourceCleanUp}: queue task started`);
          await identityAccessTokenDAL.removeExpiredTokens();
          await identityUniversalAuthClientSecretDAL.removeExpiredClientSecrets();
          await secretSharingDAL.pruneExpiredSharedSecrets();
          await secretSharingDAL.pruneExpiredSecretRequests();
          await snapshotDAL.pruneExcessSnapshots();
          await secretVersionDAL.pruneExcessVersions();
          await secretVersionV2DAL.pruneExcessVersions();
          await secretFolderVersionDAL.pruneExcessVersions();
          await serviceTokenService.notifyExpiringTokens();
          await orgService.notifyInvitedUsers();
          await auditLogDAL.pruneAuditLog();
          await userNotificationDAL.pruneNotifications();
          await keyValueStoreDAL.pruneExpiredKeys();
          logger.info(`${QueueName.DailyResourceCleanUp}: queue task completed`);
        } catch (error) {
          logger.error(error, `${QueueName.DailyResourceCleanUp}: resource cleanup failed`);
          throw error;
        }
      },
      {
        batchSize: 1,
        workerCount: 1,
        pollingIntervalSeconds: 1
      }
    );
    await queueService.schedulePg(
      QueueJobs.DailyResourceCleanUp,
      appCfg.isDailyResourceCleanUpDevelopmentMode ? "*/5 * * * *" : "0 0 * * *",
      undefined,
      { tz: "UTC" }
    );
  };

  return {
    init
  };
};
