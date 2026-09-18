import { logger } from "@app/lib/logger";
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";
import { NotificationType } from "@app/services/notification/notification-types";
import { TPkiApplicationDALFactory } from "@app/services/pki-application/pki-application-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TPkiSyncDALFactory } from "./pki-sync-dal";
import { PkiSyncFailureKind } from "./pki-sync-enums";

const FAILURE_TITLES: Record<PkiSyncFailureKind, string> = {
  [PkiSyncFailureKind.HealthCheck]: "Certificate sync health check failed",
  [PkiSyncFailureKind.Sync]: "Certificate sync failed",
  [PkiSyncFailureKind.PostSyncCommand]: "Certificate sync post-sync command failed"
};

export const notifyPkiSyncFailure = async (
  {
    pkiSync,
    kind,
    message
  }: {
    pkiSync: { id: string; name: string; projectId: string; applicationId?: string | null };
    kind: PkiSyncFailureKind;
    message: string;
  },
  deps: {
    pkiSyncDAL: Pick<TPkiSyncDALFactory, "findFailureNotificationRecipients">;
    projectDAL: Pick<TProjectDALFactory, "findById">;
    pkiApplicationDAL: Pick<TPkiApplicationDALFactory, "findById">;
    notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
  }
) => {
  const { applicationId } = pkiSync;
  if (!applicationId) return;

  try {
    const [recipients, project, application] = await Promise.all([
      deps.pkiSyncDAL.findFailureNotificationRecipients({ projectId: pkiSync.projectId, applicationId }),
      deps.projectDAL.findById(pkiSync.projectId),
      deps.pkiApplicationDAL.findById(applicationId)
    ]);

    if (!recipients.length || !project || !application) {
      logger.warn(
        `PKI sync failure had no notification recipients [syncId=${pkiSync.id}] [kind=${kind}] [applicationId=${applicationId}]`
      );
      return;
    }

    const basePath = `/organizations/${project.orgId}/projects/cert-manager/${pkiSync.projectId}`;
    const link = `${basePath}/applications/${encodeURIComponent(application.name)}?selectedTab=syncs`;

    await deps.notificationService.createUserNotifications(
      recipients.map((userId) => ({
        userId,
        orgId: project.orgId,
        type: NotificationType.PKI_SYNC_FAILED,
        title: FAILURE_TITLES[kind],
        body: `**${pkiSync.name}**: ${message}`,
        link
      }))
    );
  } catch (err) {
    logger.error(err, `Failed to notify PKI sync failure [syncId=${pkiSync.id}] [kind=${kind}]`);
  }
};
