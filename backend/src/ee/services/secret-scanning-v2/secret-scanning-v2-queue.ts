import { ProjectMembershipRole } from "@app/db/schemas";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { SECRET_ROTATION_NAME_MAP } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-maps";
import { TSecretRotationSendNotificationJobPayload } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { TSecretScanningV2DALFactory } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-dal";
import { TSecretScanningDataSource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-types";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectMembershipDALFactory } from "@app/services/project-membership/project-membership-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";

type TSecretRotationV2QueueServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  secretScanningV2DAL: Pick<TSecretScanningV2DALFactory, "dataSources" | "scans">;
  smtpService: Pick<TSmtpService, "sendMail">;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "findAllProjectMembers">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
};

export const secretScanningV2QueueServiceFactory = async ({
  queueService,
  secretScanningV2DAL,
  projectMembershipDAL,
  projectDAL,
  smtpService
}: TSecretRotationV2QueueServiceFactoryDep) => {
  const queueDataSourceFullScan = async (dataSource: TSecretScanningDataSource) => {
    const { id: scanId } = secretScanningV2DAL.scans.create({
      d
    });

    queueService.queuePg(QueueName.SecretScanningV2FullScan);
  };

  await queueService.startPg<QueueName.SecretScanningV2>(
    QueueJobs.SecretScanningV2FullScan,
    async ([job]) => {
      const { scanId } = job.data;
      const { retryCount, retryLimit } = job;

      const logDetails = `[scanId=${scanId}] [jobId=${job.id}] retryCount=[${retryCount}/${retryLimit}]`;

      try {
        const secretRotation = await secretScanningV2DAL.findById(rotationId);

        if (!secretRotation) throw new Error(`Secret rotation ${rotationId} not found`);

        if (!secretRotation.isAutoRotationEnabled) {
          logger.info(`secretRotationV2Queue: Skipping Rotation - Auto-Rotation Disabled Since Queue ${logDetails}`);
        }

        if (new Date(secretRotation.lastRotatedAt).getTime() >= new Date(queuedAt).getTime()) {
          // rotated since being queued, skip rotation
          logger.info(`secretRotationV2Queue: Skipping Rotation - Rotated Since Queue ${logDetails}`);
          return;
        }

        await secretRotationV2Service.rotateGeneratedCredentials(secretRotation, {
          jobId: job.id,
          shouldSendNotification: true,
          isFinalAttempt: retryCount === retryLimit,
          isManualRotation
        });

        logger.info(`secretRotationV2Queue: Secrets Rotated ${logDetails}`);
      } catch (error) {
        logger.error(error, `secretRotationV2Queue: Failed to Rotate Secrets ${logDetails}`);
        throw error;
      }
    },
    {
      batchSize: 1,
      workerCount: 2,
      pollingIntervalSeconds: 0.5
    }
  );

  await queueService.startPg<QueueName.SecretRotationV2>(
    QueueJobs.SecretRotationV2SendNotification,
    async ([job]) => {
      const { secretRotation } = job.data as TSecretRotationSendNotificationJobPayload;
      try {
        const {
          name: rotationName,
          type,
          projectId,
          lastRotationAttemptedAt,
          folder,
          environment,
          id: rotationId
        } = secretRotation;

        logger.info(`secretRotationV2Queue: Sending Status Notification [rotationId=${rotationId}]`);

        const projectMembers = await projectMembershipDAL.findAllProjectMembers(projectId);
        const project = await projectDAL.findById(projectId);

        const projectAdmins = projectMembers.filter((member) =>
          member.roles.some((role) => role.role === ProjectMembershipRole.Admin)
        );

        const rotationType = SECRET_ROTATION_NAME_MAP[type as SecretRotation];

        await smtpService.sendMail({
          recipients: projectAdmins.map((member) => member.user.email!).filter(Boolean),
          template: SmtpTemplates.SecretRotationFailed,
          subjectLine: `Secret Rotation Failed`,
          substitutions: {
            rotationName,
            rotationType,
            content: `Your ${rotationType} Rotation failed to rotate during it's scheduled rotation. The last rotation attempt occurred at ${new Date(
              lastRotationAttemptedAt
            ).toISOString()}. Please check the rotation status in Infisical for more details.`,
            secretPath: folder.path,
            environment: environment.name,
            projectName: project.name,
            rotationUrl: encodeURI(`${appCfg.SITE_URL}/secret-manager/${projectId}/secrets/${environment.slug}`)
          }
        });
      } catch (error) {
        logger.error(
          error,
          `secretRotationV2Queue: Failed to Send Status Notification [rotationId=${secretRotation.id}]`
        );
        throw error;
      }
    },
    {
      batchSize: 1,
      workerCount: 2,
      pollingIntervalSeconds: 1
    }
  );
};
