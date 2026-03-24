import { TAuditLogDALFactory } from "@app/ee/services/audit-log/audit-log-dal";
import { TScimServiceFactory } from "@app/ee/services/scim/scim-types";
import { TSnapshotDALFactory } from "@app/ee/services/secret-snapshot/snapshot-dal";
import { TKeyValueStoreDALFactory } from "@app/keystore/key-value-store-dal";
import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { JOB_SCHEDULER_PREFIX, QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TQueueJobsDALFactory } from "@app/queue/queue-jobs-dal";
import { TUserNotificationDALFactory } from "@app/services/notification/user-notification-dal";

import { TApprovalRequestDALFactory, TApprovalRequestGrantsDALFactory } from "../approval-policy/approval-request-dal";
import { TCertificateRequestDALFactory } from "../certificate-request/certificate-request-dal";
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
  scimService: Pick<TScimServiceFactory, "notifyExpiringTokens">;
  approvalRequestDAL: Pick<TApprovalRequestDALFactory, "markExpiredRequests">;
  approvalRequestGrantsDAL: Pick<TApprovalRequestGrantsDALFactory, "markExpiredGrants">;
  certificateRequestDAL: Pick<TCertificateRequestDALFactory, "markExpiredApprovalRequests">;
  queueJobsDAL: Pick<TQueueJobsDALFactory, "pruneQueueJobs">;
};

export type TDailyResourceCleanUpQueueServiceFactory = ReturnType<typeof dailyResourceCleanUpQueueServiceFactory>;

export const dailyResourceCleanUpQueueServiceFactory = ({
  auditLogDAL,
  queueService,
  snapshotDAL,
  secretVersionDAL,
  secretFolderVersionDAL,
  secretSharingDAL,
  secretVersionV2DAL,
  identityAccessTokenDAL,
  identityUniversalAuthClientSecretDAL,
  serviceTokenService,
  scimService,
  orgService,
  userNotificationDAL,
  keyValueStoreDAL,
  approvalRequestDAL,
  approvalRequestGrantsDAL,
  certificateRequestDAL,
  queueJobsDAL
}: TDailyResourceCleanUpQueueServiceFactoryDep) => {
  const appCfg = getConfig();

  if (appCfg.isDailyResourceCleanUpDevelopmentMode) {
    logger.warn("Daily Resource Clean Up is in development mode.");
  }

  const init = async () => {
    if (appCfg.isSecondaryInstance) {
      return;
    }

    queueService.start(QueueName.DailyResourceCleanUp, async () => {
      try {
        logger.info(`${QueueName.DailyResourceCleanUp}: queue task started`);
        await identityUniversalAuthClientSecretDAL.removeExpiredClientSecrets();
        await secretSharingDAL.pruneExpiredSharedSecrets();
        await secretSharingDAL.pruneExpiredSecretRequests();
        await snapshotDAL.pruneExcessSnapshots();
        await secretVersionDAL.pruneExcessVersions();
        await secretVersionV2DAL.pruneExcessVersions();
        await secretFolderVersionDAL.pruneExcessVersions();
        await serviceTokenService.notifyExpiringTokens();
        await scimService.notifyExpiringTokens();
        await orgService.notifyInvitedUsers();
        await auditLogDAL.pruneAuditLog();
        await userNotificationDAL.pruneNotifications();
        await keyValueStoreDAL.pruneExpiredKeys();
        await queueJobsDAL.pruneQueueJobs();
        const expiredApprovalRequestIds = await approvalRequestDAL.markExpiredRequests();
        if (expiredApprovalRequestIds.length > 0) {
          await certificateRequestDAL.markExpiredApprovalRequests(expiredApprovalRequestIds);
        }
        await approvalRequestGrantsDAL.markExpiredGrants();
        logger.info(`${QueueName.DailyResourceCleanUp}: queue task completed`);
      } catch (error) {
        logger.error(error, `${QueueName.DailyResourceCleanUp}: resource cleanup failed`);
        throw error;
      }
    });

    await queueService.upsertJobScheduler(
      QueueName.DailyResourceCleanUp,
      `${JOB_SCHEDULER_PREFIX}:${QueueJobs.DailyResourceCleanUp}`,
      { pattern: appCfg.isDailyResourceCleanUpDevelopmentMode ? "*/5 * * * *" : "0 0 * * *" },
      { name: QueueJobs.DailyResourceCleanUp }
    );

    // Hourly cleanup routine
    queueService.start(QueueName.FrequentResourceCleanUp, async () => {
      try {
        logger.info(`${QueueName.FrequentResourceCleanUp}: queue task started`);
        await identityAccessTokenDAL.removeExpiredTokens();
        logger.info(`${QueueName.FrequentResourceCleanUp}: queue task completed`);
      } catch (error) {
        logger.error(error, `${QueueName.FrequentResourceCleanUp}: resource cleanup failed`);
        throw error;
      }
    });

    await queueService.upsertJobScheduler(
      QueueName.FrequentResourceCleanUp,
      `${JOB_SCHEDULER_PREFIX}:${QueueJobs.FrequentResourceCleanUp}`,
      { pattern: appCfg.isDailyResourceCleanUpDevelopmentMode ? "*/5 * * * *" : "0 * * * *" },
      { name: QueueJobs.FrequentResourceCleanUp }
    );
  };

  return {
    init
  };
};
