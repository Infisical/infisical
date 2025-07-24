import { ProjectMembershipRole } from "@app/db/schemas";
import { TSecretRotationV2DALFactory } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-dal";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import {
  getNextUtcRotationInterval,
  getSecretRotationRotateSecretJobOptions
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-fns";
import { SECRET_ROTATION_NAME_MAP } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-maps";
import { TSecretRotationV2ServiceFactory } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-service";
import {
  TSecretRotationRotateSecretsJobPayload,
  TSecretRotationSendNotificationJobPayload
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectMembershipDALFactory } from "@app/services/project-membership/project-membership-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";

type TSecretRotationV2QueueServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  secretRotationV2DAL: Pick<TSecretRotationV2DALFactory, "findSecretRotationsToQueue" | "findById">;
  secretRotationV2Service: Pick<TSecretRotationV2ServiceFactory, "rotateGeneratedCredentials">;
  smtpService: Pick<TSmtpService, "sendMail">;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "findAllProjectMembers">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
};

export const secretRotationV2QueueServiceFactory = async ({
  queueService,
  secretRotationV2DAL,
  secretRotationV2Service,
  projectMembershipDAL,
  projectDAL,
  smtpService
}: TSecretRotationV2QueueServiceFactoryDep) => {
  const appCfg = getConfig();

  if (appCfg.isRotationDevelopmentMode) {
    logger.warn("Secret Rotation V2 is in development mode.");
  }

  await queueService.startPg<QueueName.SecretRotationV2>(
    QueueJobs.SecretRotationV2QueueRotations,
    async () => {
      try {
        const rotateBy = getNextUtcRotationInterval();

        const currentTime = new Date();

        const secretRotations = await secretRotationV2DAL.findSecretRotationsToQueue(rotateBy);

        logger.info(
          `secretRotationV2Queue: Queue Rotations [currentTime=${currentTime.toISOString()}] [rotateBy=${rotateBy.toISOString()}] [count=${
            secretRotations.length
          }]`
        );

        for await (const rotation of secretRotations) {
          logger.info(
            `secretRotationV2Queue: Queue Rotation [rotationId=${rotation.id}] [lastRotatedAt=${new Date(
              rotation.lastRotatedAt
            ).toISOString()}] [rotateAt=${new Date(rotation.nextRotationAt!).toISOString()}]`
          );
          await queueService.queuePg(
            QueueJobs.SecretRotationV2RotateSecrets,
            {
              rotationId: rotation.id,
              queuedAt: currentTime
            },
            getSecretRotationRotateSecretJobOptions(rotation)
          );
        }
      } catch (error) {
        logger.error(error, "secretRotationV2Queue: Queue Rotations Error:");
        throw error;
      }
    },
    {
      batchSize: 1,
      workerCount: 1,
      pollingIntervalSeconds: appCfg.isRotationDevelopmentMode ? 0.5 : 30
    }
  );

  await queueService.startPg<QueueName.SecretRotationV2>(
    QueueJobs.SecretRotationV2RotateSecrets,
    async ([job]) => {
      const { rotationId, queuedAt, isManualRotation } = job.data as TSecretRotationRotateSecretsJobPayload;
      const { retryCount, retryLimit } = job;

      const logDetails = `[rotationId=${rotationId}] [jobId=${job.id}] retryCount=[${retryCount}/${retryLimit}]`;

      try {
        const secretRotation = await secretRotationV2DAL.findById(rotationId);

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
            rotationUrl: encodeURI(
              `${appCfg.SITE_URL}/projects/secret-management/${projectId}/secrets/${environment.slug}`
            )
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

  await queueService.schedulePg(
    QueueJobs.SecretRotationV2QueueRotations,
    appCfg.isRotationDevelopmentMode ? "* * * * *" : "0 0 * * *",
    undefined,
    { tz: "UTC" }
  );
};
