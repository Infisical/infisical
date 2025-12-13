import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { TInternalKmsDALFactory } from "./internal-kms-dal";
import { TKmsServiceFactory } from "./kms-service";

type TKmsKeyRotationQueueServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  internalKmsDAL: Pick<TInternalKmsDALFactory, "findKeysToRotate">;
  kmsService: Pick<TKmsServiceFactory, "rotateInternalKmsKey">;
};

type TKmsKeyRotationRotateKeyPayload = {
  kmsKeyId: string;
  internalKmsId: string;
  keyName: string;
  projectId: string;
  queuedAt: Date;
};

export const kmsKeyRotationQueueServiceFactory = async ({
  queueService,
  internalKmsDAL,
  kmsService
}: TKmsKeyRotationQueueServiceFactoryDep) => {
  // Queue rotations job - runs daily to find keys due for rotation
  await queueService.startPg<QueueName.KmsKeyRotation>(
    QueueJobs.KmsKeyRotationQueueRotations,
    async () => {
      try {
        const currentTime = new Date();
        // Find keys where nextRotationAt <= current time
        const keysToRotate = await internalKmsDAL.findKeysToRotate(currentTime);

        logger.info(
          `kmsKeyRotationQueue: Queue Rotations [currentTime=${currentTime.toISOString()}] [count=${keysToRotate.length}]`
        );

        for await (const key of keysToRotate) {
          logger.info(
            `kmsKeyRotationQueue: Queueing rotation [kmsKeyId=${key.kmsKeyId}] [keyName=${key.keyName}] [nextRotationAt=${key.nextRotationAt?.toISOString()}]`
          );

          await queueService.queuePg(
            QueueJobs.KmsKeyRotationRotateKey,
            {
              kmsKeyId: key.kmsKeyId,
              internalKmsId: key.id,
              keyName: key.keyName,
              projectId: key.projectId,
              queuedAt: currentTime
            } as TKmsKeyRotationRotateKeyPayload,
            {
              jobId: `kms-key-rotation-${key.kmsKeyId}-${key.id}-${currentTime.getTime()}`,
              retryLimit: 3,
              retryBackoff: true
            }
          );
        }
      } catch (error) {
        logger.error(error, "kmsKeyRotationQueue: Queue Rotations Error:");
        throw error;
      }
    },
    {
      batchSize: 1,
      workerCount: 1,
      pollingIntervalSeconds: 30
    }
  );

  // Rotate key job - performs the actual key rotation
  await queueService.startPg<QueueName.KmsKeyRotation>(
    QueueJobs.KmsKeyRotationRotateKey,
    async ([job]) => {
      const { kmsKeyId, keyName } = job.data as TKmsKeyRotationRotateKeyPayload;

      try {
        logger.info(
          `kmsKeyRotationQueue: Rotating key [kmsKeyId=${kmsKeyId}] [keyName=${keyName}] [attempt=${job.retryCount + 1}]`
        );

        const result = await kmsService.rotateInternalKmsKey(kmsKeyId);

        logger.info(
          `kmsKeyRotationQueue: Key rotated successfully [kmsKeyId=${kmsKeyId}] [keyName=${keyName}] [newVersion=${result.version}]`
        );
      } catch (error) {
        logger.error(
          error,
          `kmsKeyRotationQueue: Failed to rotate key [kmsKeyId=${kmsKeyId}] [keyName=${keyName}] [attempt=${job.retryCount + 1}]`
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

  // Schedule the queue rotations job to run daily at midnight UTC
  await queueService.schedulePg(QueueJobs.KmsKeyRotationQueueRotations, "0 0 * * *", undefined, { tz: "UTC" });

  logger.info("kmsKeyRotationQueue: KMS key rotation queue initialized");
};
