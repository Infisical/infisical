import { DisableRotationErrors } from "@app/ee/services/secret-rotation/secret-rotation-queue";
import { applyJitter } from "@app/lib/delay";
import { NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TDynamicSecretDALFactory } from "../dynamic-secret/dynamic-secret-dal";
import { DynamicSecretStatus } from "../dynamic-secret/dynamic-secret-types";
import { DynamicSecretProviders, TDynamicProviderFns } from "../dynamic-secret/providers/models";
import { TDynamicSecretLeaseDALFactory } from "./dynamic-secret-lease-dal";
import { TDynamicSecretLeaseConfig } from "./dynamic-secret-lease-types";

type TDynamicSecretLeaseQueueServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  dynamicSecretLeaseDAL: Pick<TDynamicSecretLeaseDALFactory, "findById" | "deleteById" | "find" | "updateById">;
  smtpService: Pick<TSmtpService, "sendMail">;
  userDAL: Pick<TUserDALFactory, "findById">;
  identityDAL: TIdentityDALFactory;
  dynamicSecretDAL: Pick<TDynamicSecretDALFactory, "findById" | "deleteById" | "updateById">;
  dynamicSecretProviders: Record<DynamicSecretProviders, TDynamicProviderFns>;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  folderDAL: Pick<TSecretFolderDALFactory, "findById">;
};

export type TDynamicSecretLeaseQueueServiceFactory = {
  pruneDynamicSecret: (dynamicSecretCfgId: string) => Promise<void>;
  setLeaseRevocation: (leaseId: string, expiryAt: Date) => Promise<void>;
  unsetLeaseRevocation: (leaseId: string) => Promise<void>;
  queueFailedRevocation: (leaseId: string) => Promise<void>;
  init: () => Promise<void>;
};

export const dynamicSecretLeaseQueueServiceFactory = ({
  queueService,
  dynamicSecretDAL,
  dynamicSecretProviders,
  dynamicSecretLeaseDAL,
  kmsService,
  folderDAL
}: TDynamicSecretLeaseQueueServiceFactoryDep): TDynamicSecretLeaseQueueServiceFactory => {
  const pruneDynamicSecret = async (dynamicSecretCfgId: string) => {
    await queueService.queuePg<QueueName.DynamicSecretRevocation>(
      QueueJobs.DynamicSecretPruning,
      { dynamicSecretCfgId },
      {
        singletonKey: dynamicSecretCfgId,
        retryLimit: 3,
        retryBackoff: true
      }
    );
  };

  const setLeaseRevocation = async (leaseId: string, expiryAt: Date) => {
    await queueService.queuePg<QueueName.DynamicSecretRevocation>(
      QueueJobs.DynamicSecretRevocation,
      { leaseId },
      {
        id: leaseId,
        singletonKey: leaseId,
        startAfter: expiryAt,
        retryLimit: 3,
        retryBackoff: true,
        retentionDays: 2
      }
    );
  };

  const unsetLeaseRevocation = async (leaseId: string) => {
    await queueService.stopJobById(QueueName.DynamicSecretRevocation, leaseId);
    await queueService.stopJobByIdPg(QueueName.DynamicSecretRevocation, leaseId);
  };

  const queueFailedRevocation = async (leaseId: string) => {
    await queueService.queuePg<QueueName.DynamicSecretRevocation>(
      QueueJobs.DynamicSecretRevocation,
      { leaseId },
      {
        singletonKey: `${leaseId}-retry`, // avoid conflicts with scheduled revocation
        retryDelay: Math.floor(applyJitter(3_600_000 * 4) / 1000), // retry every 4 hours with 20% +- jitter (convert ms to seconds for pgboss)
        retryLimit: 10, // we dont want it to ever hit the limit, we want the expireInHours to take effect.
        expireInHours: 23, // if we set it to 24 hours, pgboss will complain that the expireIn is too high
        deadLetter: QueueName.DynamicSecretRevocationFailedRetry // if all fails, we will send a notification to the user
      }
    );
  };

  const $dynamicSecretQueueJob = async (
    jobName: string,
    jobId: string,
    data: { leaseId: string } | { dynamicSecretCfgId: string }
  ): Promise<void> => {
    try {
      if (jobName === QueueJobs.DynamicSecretRevocation) {
        const { leaseId } = data as { leaseId: string };
        logger.info("Dynamic secret lease revocation started: ", leaseId, jobId);

        const dynamicSecretLease = await dynamicSecretLeaseDAL.findById(leaseId);
        if (!dynamicSecretLease) {
          throw new DisableRotationErrors({ message: "Dynamic secret lease not found" });
        }

        const folder = await folderDAL.findById(dynamicSecretLease.dynamicSecret.folderId);
        if (!folder)
          throw new NotFoundError({
            message: `Failed to find folder with ${dynamicSecretLease.dynamicSecret.folderId}`
          });

        const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
          type: KmsDataKey.SecretManager,
          projectId: folder.projectId
        });

        const dynamicSecretCfg = dynamicSecretLease.dynamicSecret;
        const selectedProvider = dynamicSecretProviders[dynamicSecretCfg.type as DynamicSecretProviders];
        const decryptedStoredInput = JSON.parse(
          secretManagerDecryptor({ cipherTextBlob: dynamicSecretCfg.encryptedInput }).toString()
        ) as object;

        await selectedProvider.revoke(decryptedStoredInput, dynamicSecretLease.externalEntityId, {
          projectId: folder.projectId
        });
        await dynamicSecretLeaseDAL.deleteById(dynamicSecretLease.id);
        return;
      }

      if (jobName === QueueJobs.DynamicSecretPruning) {
        const { dynamicSecretCfgId } = data as { dynamicSecretCfgId: string };
        logger.info("Dynamic secret pruning started: ", dynamicSecretCfgId, jobId);
        const dynamicSecretCfg = await dynamicSecretDAL.findById(dynamicSecretCfgId);
        if (!dynamicSecretCfg) throw new DisableRotationErrors({ message: "Dynamic secret not found" });
        if ((dynamicSecretCfg.status as DynamicSecretStatus) !== DynamicSecretStatus.Deleting)
          throw new DisableRotationErrors({ message: "Document not deleted" });

        const folder = await folderDAL.findById(dynamicSecretCfg.folderId);
        if (!folder)
          throw new NotFoundError({
            message: `Failed to find folder with ${dynamicSecretCfg.folderId}`
          });

        const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
          type: KmsDataKey.SecretManager,
          projectId: folder.projectId
        });

        const dynamicSecretLeases = await dynamicSecretLeaseDAL.find({ dynamicSecretId: dynamicSecretCfgId });
        if (dynamicSecretLeases.length) {
          const selectedProvider = dynamicSecretProviders[dynamicSecretCfg.type as DynamicSecretProviders];
          const decryptedStoredInput = JSON.parse(
            secretManagerDecryptor({ cipherTextBlob: dynamicSecretCfg.encryptedInput }).toString()
          ) as object;

          await Promise.all(dynamicSecretLeases.map(({ id }) => unsetLeaseRevocation(id)));
          await Promise.all(
            dynamicSecretLeases.map(({ externalEntityId, config }) =>
              selectedProvider.revoke(
                decryptedStoredInput,
                externalEntityId,
                {
                  projectId: folder.projectId
                },
                config as TDynamicSecretLeaseConfig
              )
            )
          );
        }

        await dynamicSecretDAL.deleteById(dynamicSecretCfgId);
      }
      logger.info("Finished dynamic secret job", jobId);
    } catch (error) {
      logger.error(error, "Failed to delete dynamic secret");

      if (jobName === QueueJobs.DynamicSecretPruning) {
        const { dynamicSecretCfgId } = data as { dynamicSecretCfgId: string };
        await dynamicSecretDAL.updateById(dynamicSecretCfgId, {
          status: DynamicSecretStatus.FailedDeletion,
          statusDetails: (error as Error)?.message?.slice(0, 255)
        });
      }

      if (jobName === QueueJobs.DynamicSecretRevocation) {
        const { leaseId } = data as { leaseId: string };
        await dynamicSecretLeaseDAL.updateById(leaseId, {
          status: DynamicSecretStatus.FailedDeletion,
          statusDetails: (error as Error)?.message?.slice(0, 255)
        });

        // if revocation fails, we should stop the job and queue a new job to retry the revocation at a later time.
        await queueService.stopJobByIdPg(QueueName.DynamicSecretRevocation, jobId);
        await queueFailedRevocation(leaseId);
      }
      if (error instanceof DisableRotationErrors) {
        if (jobId) {
          await queueService.stopRepeatableJobByJobId(QueueName.DynamicSecretRevocation, jobId);
          await queueService.stopJobByIdPg(QueueName.DynamicSecretRevocation, jobId);
        }
      }
    }
  };

  // TODO(daniel): add alerting. this is scaffolding for now, pending dashboard overview page for alerts.
  const $dynamicSecretRevocationFailedRetryJob = async (jobData: { leaseId: string }, jobId: string) => {
    try {
      const { leaseId } = jobData;
      logger.info({ leaseId, jobId }, "Dynamic secret revocation failed. Notifying root user about failed revocation.");
      // const lease = await dynamicSecretLeaseDAL.findById(leaseId);
      // if (!lease) {
      //   throw new DisableRotationErrors({ message: "Dynamic secret lease not found" });
      // }
      // const folder = await folderDAL.findById(lease.dynamicSecret.folderId);
      // if (!folder) throw new NotFoundError({ message: `Failed to find folder with ${lease.dynamicSecret.folderId}` });
      //
      //
      // this is where we would send a notification to the user who created the identity, that started the revocation process.
      // currently we have no way of knowing which user created the identity, so we cannot send them a notification.
      // we shouldn't send an email for EVERY failed revocation. we should have a delay in between, so we don't send spam emails.
      // we should have a delay for 2 minutes so we only send out (at most) 1 email every 2 minutes for revocations.
      // as an example if 100 failed revocations happen at the same time, we only send out 1 email.
    } catch (error) {
      if (error instanceof DisableRotationErrors) {
        if (jobId) {
          await queueService.stopJobById(QueueName.DynamicSecretRevocationFailedRetry, jobId);
          await queueService.stopJobByIdPg(QueueName.DynamicSecretRevocationFailedRetry, jobId);
        }
      }

      throw error;
    }
  };

  queueService.start(QueueName.DynamicSecretRevocation, async (job) => {
    await $dynamicSecretQueueJob(job.name, job.id as string, job.data);
  });

  const init = async () => {
    await queueService.startPg<QueueName.DynamicSecretRevocation>(
      QueueJobs.DynamicSecretRevocation,
      async ([job]) => {
        await $dynamicSecretQueueJob(job.name, job.id, job.data);
      },
      {
        workerCount: 5,
        pollingIntervalSeconds: 1
      }
    );

    await queueService.startPg<QueueName.DynamicSecretRevocation>(
      QueueJobs.DynamicSecretPruning,
      async ([job]) => {
        await $dynamicSecretQueueJob(job.name, job.id, job.data);
      },
      {
        workerCount: 1,
        pollingIntervalSeconds: 1
      }
    );

    // this job is triggered when the dead letter queue is triggered from retrying failed lease revocations.
    await queueService.startPg<QueueName.DynamicSecretRevocationFailedRetry>(
      QueueJobs.DynamicSecretRevocationFailedRetry,
      async ([job]) => {
        await $dynamicSecretRevocationFailedRetryJob(job.data, job.id);
      },
      {
        workerCount: 5,
        pollingIntervalSeconds: 1
      }
    );
  };

  return {
    pruneDynamicSecret,
    setLeaseRevocation,
    unsetLeaseRevocation,
    queueFailedRevocation,
    init
  };
};
