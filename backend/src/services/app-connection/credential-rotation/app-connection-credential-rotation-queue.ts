import { v4 as uuidv4 } from "uuid";

import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

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
};

export const appConnectionCredentialRotationQueueFactory = async ({
  queueService,
  appConnectionCredentialRotationDAL,
  appConnectionCredentialRotationService
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
          isFinalAttempt: retryCount === retryLimit,
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

        // Notification sending can be expanded later with email + in-app notifications
        logger.warn(
          `credentialRotationQueue: Credential rotation failed for connection "${payload.connectionName}" (strategy: ${payload.strategy}). Last attempt: ${payload.lastRotationAttemptedAt.toISOString()}`
        );
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
  await queueService.queue(
    QueueName.AppConnectionCredentialRotation,
    QueueJobs.AppConnectionCredentialRotationQueueRotations,
    undefined,
    {
      jobId: "app-connection-credential-rotation-cron",
      repeat: {
        pattern: appCfg.isRotationDevelopmentMode ? "* * * * *" : "0 0 * * *",
        key: "app-connection-credential-rotation-cron"
      }
    }
  );
};
