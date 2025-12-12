import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { ActorType } from "@app/services/auth/auth-type";

import { TInternalKmsDALFactory } from "./internal-kms-dal";
import { TKmsServiceFactory } from "./kms-service";
import { KMS_ROTATION_CONSTANTS } from "./kms-types";

type TKmsKeyRotationQueueServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  keyStore: Pick<TKeyStoreFactory, "acquireLock">;
  internalKmsDAL: Pick<TInternalKmsDALFactory, "findKeysToRotate" | "markKeysAsQueued" | "restoreNextRotationAt">;
  kmsService: Pick<TKmsServiceFactory, "rotateInternalKmsKey">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
};

type TKmsKeyRotationRotateKeyPayload = {
  kmsKeyId: string;
  internalKmsId: string;
  keyName: string;
  projectId: string;
  orgId: string;
  queuedAt: Date;
  rotationIntervalDays: number;
};

export const kmsKeyRotationQueueServiceFactory = async ({
  queueService,
  keyStore,
  internalKmsDAL,
  kmsService,
  auditLogService
}: TKmsKeyRotationQueueServiceFactoryDep) => {
  await queueService.startPg<QueueName.KmsKeyRotation>(
    QueueJobs.KmsKeyRotationQueueRotations,
    async () => {
      const lock = await keyStore
        .acquireLock([KeyStorePrefixes.KmsKeyRotationQueueLock], 60000, { retryCount: 0 })
        .catch(() => null);

      if (!lock) {
        logger.info("kmsKeyRotationQueue: Another worker is already processing queue rotations, skipping");
        return;
      }

      try {
        const currentTime = new Date();
        const keysToRotate = await internalKmsDAL.findKeysToRotate(currentTime);

        logger.info(
          `kmsKeyRotationQueue: Queue Rotations [currentTime=${currentTime.toISOString()}] [count=${keysToRotate.length}]`
        );

        if (keysToRotate.length === 0) {
          return;
        }

        // Process in batches - mark as queued AFTER successfully queueing each batch
        // This prevents keys being stuck if the process crashes mid-way
        for (let i = 0; i < keysToRotate.length; i += KMS_ROTATION_CONSTANTS.QUEUE_BATCH_SIZE) {
          const batch = keysToRotate.slice(i, i + KMS_ROTATION_CONSTANTS.QUEUE_BATCH_SIZE);

          // Queue the jobs first
          // eslint-disable-next-line no-await-in-loop
          await Promise.all(
            batch.map((key) => {
              logger.info(
                `kmsKeyRotationQueue: Queueing rotation [kmsKeyId=${key.kmsKeyId}] [keyName=${key.keyName}] [nextRotationAt=${key.nextRotationAt?.toISOString()}]`
              );

              // Use nextRotationAt in jobId for deduplication - if process crashes and restarts,
              // the same jobId will be generated, allowing the queue to deduplicate
              const jobId = `kms-key-rotation-${key.kmsKeyId}-${key.nextRotationAt?.getTime() ?? currentTime.getTime()}`;
              return queueService.queuePg(
                QueueJobs.KmsKeyRotationRotateKey,
                {
                  kmsKeyId: key.kmsKeyId,
                  internalKmsId: key.id,
                  keyName: key.keyName,
                  projectId: key.projectId,
                  orgId: key.orgId,
                  queuedAt: currentTime,
                  rotationIntervalDays: key.rotationInterval ?? KMS_ROTATION_CONSTANTS.DEFAULT_INTERVAL_DAYS
                } as TKmsKeyRotationRotateKeyPayload,
                {
                  jobId,
                  retryLimit: KMS_ROTATION_CONSTANTS.MAX_RETRIES,
                  retryBackoff: true
                }
              );
            })
          );

          // Only mark as queued AFTER jobs are successfully queued
          const batchIds = batch.map((key) => key.id);
          // eslint-disable-next-line no-await-in-loop
          await internalKmsDAL.markKeysAsQueued(batchIds, true);
        }
      } catch (error) {
        logger.error(error, "kmsKeyRotationQueue: Queue Rotations Error:");
        throw error;
      } finally {
        await lock.release().catch((err) => {
          logger.error(err, "kmsKeyRotationQueue: Failed to release queue lock");
        });
      }
    },
    {
      batchSize: 1,
      workerCount: 1,
      pollingIntervalSeconds: 30
    }
  );

  await queueService.startPg<QueueName.KmsKeyRotation>(
    QueueJobs.KmsKeyRotationRotateKey,
    async ([job]) => {
      const { kmsKeyId, internalKmsId, keyName, projectId, orgId, rotationIntervalDays } =
        job.data as TKmsKeyRotationRotateKeyPayload;
      const isLastAttempt = job.retryCount >= KMS_ROTATION_CONSTANTS.MAX_RETRIES;
      const attemptInfo = `${job.retryCount + 1}/${KMS_ROTATION_CONSTANTS.MAX_RETRIES + 1}`;
      const jobId = job.id;

      try {
        logger.info(
          `kmsKeyRotationQueue: Rotating key [kmsKeyId=${kmsKeyId}] [keyName=${keyName}] [attempt=${attemptInfo}]`
        );

        const result = await kmsService.rotateInternalKmsKey(kmsKeyId, {
          isInternalCall: true,
          isManualRotation: false,
          jobId
        });

        logger.info(
          `kmsKeyRotationQueue: Key rotated successfully [kmsKeyId=${kmsKeyId}] [keyName=${keyName}] [newVersion=${result.version}]`
        );

        // Create audit log for successful auto-rotation
        await auditLogService.createAuditLog({
          actor: {
            type: ActorType.PLATFORM,
            metadata: {}
          },
          orgId,
          projectId,
          event: {
            type: EventType.ROTATE_CMEK,
            metadata: {
              keyId: kmsKeyId,
              newVersion: result.version,
              deletedVersions: result.deletedVersions,
              deletedVersionCount: result.deletedVersionCount,
              isAutoRotation: true
            }
          }
        });
      } catch (error) {
        logger.error(
          error,
          `kmsKeyRotationQueue: Failed to rotate key [kmsKeyId=${kmsKeyId}] [keyName=${keyName}] [attempt=${attemptInfo}]`
        );

        if (isLastAttempt) {
          logger.warn(
            `kmsKeyRotationQueue: All retries exhausted for key [kmsKeyId=${kmsKeyId}]. Restoring nextRotationAt to prevent permanent auto-rotation failure.`
          );

          // Create audit log for failed auto-rotation (only on final attempt)
          const errorMessage = error instanceof Error ? error.message : "Unknown error during key rotation";
          await auditLogService
            .createAuditLog({
              actor: {
                type: ActorType.PLATFORM,
                metadata: {}
              },
              orgId,
              projectId,
              event: {
                type: EventType.ROTATE_CMEK_FAILED,
                metadata: {
                  keyId: kmsKeyId,
                  errorMessage,
                  isAutoRotation: true,
                  attemptNumber: job.retryCount + 1,
                  maxAttempts: KMS_ROTATION_CONSTANTS.MAX_RETRIES + 1
                }
              }
            })
            .catch((auditErr) => {
              logger.error(auditErr, `kmsKeyRotationQueue: Failed to create audit log for failed rotation`);
            });

          try {
            await internalKmsDAL.restoreNextRotationAt(internalKmsId, rotationIntervalDays);
            logger.info(
              `kmsKeyRotationQueue: Restored nextRotationAt for key [kmsKeyId=${kmsKeyId}] [intervalDays=${rotationIntervalDays}]`
            );
          } catch (restoreError) {
            logger.error(
              restoreError,
              `kmsKeyRotationQueue: Failed to restore nextRotationAt for key [kmsKeyId=${kmsKeyId}]. Auto-rotation may be broken for this key.`
            );
          }
        }

        throw error;
      }
    },
    {
      batchSize: 1,
      workerCount: 2,
      pollingIntervalSeconds: 1
    }
  );

  await queueService.schedulePg(QueueJobs.KmsKeyRotationQueueRotations, "0 0 * * *", undefined, { tz: "UTC" });

  logger.info("kmsKeyRotationQueue: KMS key rotation queue initialized");
};
