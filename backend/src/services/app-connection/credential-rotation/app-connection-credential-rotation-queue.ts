import { v4 as uuidv4 } from "uuid";

import { OrgMembershipRole, ProjectMembershipRole } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { JOB_SCHEDULER_PREFIX, QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";
import { NotificationType } from "@app/services/notification/notification-types";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectMembershipDALFactory } from "@app/services/project-membership/project-membership-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";

import { TAppConnectionCredentialRotationDALFactory } from "./app-connection-credential-rotation-dal";
import { getCredentialRotationJobOptions, getNextUtcRotationInterval } from "./app-connection-credential-rotation-fns";
import { TAppConnectionCredentialRotationServiceFactory } from "./app-connection-credential-rotation-service";
import {
  TAppConnectionCredentialRotationRotateJobPayload,
  TAppConnectionCredentialRotationSendNotificationJobPayload
} from "./app-connection-credential-rotation-types";

type TAppConnectionCredentialRotationQueueFactoryDep = {
  queueService: TQueueServiceFactory;
  appConnectionCredentialRotationDAL: Pick<
    TAppConnectionCredentialRotationDALFactory,
    "findRotationsDueForQueue" | "findByIdWithConnection"
  >;
  appConnectionCredentialRotationService: Pick<TAppConnectionCredentialRotationServiceFactory, "rotateCredentials">;
  smtpService: Pick<TSmtpService, "sendMail">;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "findAllProjectMembers">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  orgDAL: Pick<TOrgDALFactory, "findAllOrgMembers">;
};

export const appConnectionCredentialRotationQueueFactory = async ({
  queueService,
  appConnectionCredentialRotationDAL,
  appConnectionCredentialRotationService,
  smtpService,
  notificationService,
  projectMembershipDAL,
  projectDAL,
  orgDAL
}: TAppConnectionCredentialRotationQueueFactoryDep) => {
  const appCfg = getConfig();

  if (appCfg.isRotationDevelopmentMode) {
    logger.warn("App Connection Credential Rotation is in development mode.");
  }

  // Worker for individual rotation jobs
  queueService.start(
    QueueName.AppConnectionCredentialRotationRotate,
    async (job) => {
      const { rotationId, queuedAt, isManualRotation } = job.data;
      const retryCount = job.attemptsMade;
      const retryLimit = job.opts.attempts || 1;

      const logDetails = `[rotationId=${rotationId}] [jobId=${job.id}] retryCount=[${retryCount}/${retryLimit}]`;

      try {
        const rotation = await appConnectionCredentialRotationDAL.findByIdWithConnection(rotationId);

        if (!rotation) {
          logger.warn(`credentialRotationQueue: Rotation ${rotationId} not found, skipping`);
          return;
        }

        if (!rotation.isAutoRotationEnabled && !isManualRotation) {
          logger.info(`credentialRotationQueue: Skipping - Auto-Rotation Disabled ${logDetails}`);
          return;
        }

        if (rotation.lastRotatedAt && new Date(rotation.lastRotatedAt).getTime() >= new Date(queuedAt).getTime()) {
          logger.info(`credentialRotationQueue: Skipping - Rotated Since Queue ${logDetails}`);
          return;
        }

        await appConnectionCredentialRotationService.rotateCredentials(rotationId, {
          jobId: job.id || uuidv4(),
          shouldSendNotification: true,
          isFinalAttempt: retryCount + 1 >= retryLimit,
          isManualRotation
        });

        logger.info(`credentialRotationQueue: Credentials Rotated ${logDetails}`);
      } catch (error) {
        logger.error(error, `credentialRotationQueue: Failed to Rotate ${logDetails}`);
        throw error;
      }
    },
    {
      persistence: true
    }
  );

  // Worker for scheduling and notifications
  queueService.start(QueueName.AppConnectionCredentialRotation, async (job) => {
    if (job.name === QueueJobs.AppConnectionCredentialRotationQueueRotations) {
      try {
        const rotateBy = getNextUtcRotationInterval();
        const currentTime = new Date();

        const rotations = await appConnectionCredentialRotationDAL.findRotationsDueForQueue(rotateBy);

        logger.info(
          `credentialRotationQueue: Queue Rotations [currentTime=${currentTime.toISOString()}] [rotateBy=${rotateBy.toISOString()}] [count=${rotations.length}]`
        );

        for await (const rotation of rotations) {
          logger.info(
            `credentialRotationQueue: Queue Rotation [rotationId=${rotation.id}] [nextRotationAt=${
              rotation.nextRotationAt ? new Date(rotation.nextRotationAt).toISOString() : "null"
            }]`
          );

          const data: TAppConnectionCredentialRotationRotateJobPayload = {
            rotationId: rotation.id,
            connectionId: rotation.connectionId,
            queuedAt: currentTime
          };

          if (appCfg.isTestMode) {
            logger.warn("credentialRotationQueue: Manually rotating for test mode");
            await appConnectionCredentialRotationService.rotateCredentials(rotation.id, {
              jobId: uuidv4(),
              shouldSendNotification: true,
              isFinalAttempt: true,
              isManualRotation: false
            });
          } else {
            await queueService.queue(
              QueueName.AppConnectionCredentialRotationRotate,
              QueueJobs.AppConnectionCredentialRotationRotate,
              data,
              getCredentialRotationJobOptions(rotation)
            );
          }
        }
      } catch (error) {
        logger.error(error, "credentialRotationQueue: Queue Rotations Error:");
        throw error;
      }
    } else if (job.name === QueueJobs.AppConnectionCredentialRotationSendNotification) {
      const payload = job.data as TAppConnectionCredentialRotationSendNotificationJobPayload;
      try {
        logger.info(`credentialRotationQueue: Sending Failure Notification [connectionId=${payload.connectionId}]`);

        let adminEmails: string[] = [];
        let adminUserIds: string[] = [];
        let projectName: string | undefined;
        let rotationUrl: string;

        if (payload.projectId) {
          // Project-scoped connection: notify project admins
          const projectMembers = await projectMembershipDAL.findAllProjectMembers(payload.projectId);
          const project = await projectDAL.findById(payload.projectId);

          const projectAdmins = projectMembers.filter((member) =>
            member.roles.some((role) => role.role === ProjectMembershipRole.Admin)
          );

          adminEmails = projectAdmins.map((admin) => admin.user.email!).filter(Boolean);
          adminUserIds = projectAdmins.map((admin) => admin.userId);
          projectName = project.name;
          rotationUrl = encodeURI(
            `${appCfg.SITE_URL}/organizations/${payload.orgId}/projects/secret-management/${payload.projectId}/app-connections`
          );
        } else {
          // Org-scoped connection: notify org admins
          const orgMembers = await orgDAL.findAllOrgMembers(payload.orgId);

          const orgAdmins = orgMembers.filter((member) => member.role === OrgMembershipRole.Admin);

          adminEmails = orgAdmins.map((admin) => admin.user.email!).filter(Boolean);
          adminUserIds = orgAdmins.map((admin) => admin.user.id);
          rotationUrl = encodeURI(`${appCfg.SITE_URL}/organizations/${payload.orgId}/app-connections`);
        }

        const rotationType = payload.strategy;

        await notificationService.createUserNotifications(
          adminUserIds.map((userId) => ({
            userId,
            orgId: payload.orgId,
            type: NotificationType.CREDENTIAL_ROTATION_FAILED,
            title: "Credential Rotation Failed",
            body: `Your **${rotationType}** credential rotation for connection **${payload.connectionName}** failed to rotate.`,
            link: rotationUrl
          }))
        );

        await smtpService.sendMail({
          recipients: adminEmails,
          template: SmtpTemplates.CredentialRotationFailed,
          subjectLine: "Credential Rotation Failed",
          substitutions: {
            connectionName: payload.connectionName,
            rotationType,
            content: `Your ${rotationType} credential rotation failed during its scheduled rotation. The last rotation attempt occurred at ${new Date(
              payload.lastRotationAttemptedAt
            ).toISOString()}. Please check the rotation status in Infisical for more details.`,
            projectName,
            rotationUrl
          }
        });
      } catch (error) {
        logger.error(
          error,
          `credentialRotationQueue: Failed to Send Notification [connectionId=${payload.connectionId}]`
        );
        throw error;
      }
    }
  });

  // Schedule the cron job
  await queueService.upsertJobScheduler(
    QueueName.AppConnectionCredentialRotation,
    `${JOB_SCHEDULER_PREFIX}:app-connection-credential-rotation-cron`,
    { pattern: appCfg.isRotationDevelopmentMode ? "* * * * *" : "0 0 * * *" },
    { name: QueueJobs.AppConnectionCredentialRotationQueueRotations }
  );
};
