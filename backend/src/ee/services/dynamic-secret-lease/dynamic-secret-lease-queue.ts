import { DisableRotationErrors } from "@app/ee/services/secret-rotation/secret-rotation-queue";
import { NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";

import { TDynamicSecretDALFactory } from "../dynamic-secret/dynamic-secret-dal";
import { DynamicSecretStatus } from "../dynamic-secret/dynamic-secret-types";
import { DynamicSecretProviders, TDynamicProviderFns } from "../dynamic-secret/providers/models";
import { TDynamicSecretLeaseDALFactory } from "./dynamic-secret-lease-dal";
import { TDynamicSecretLeaseConfig } from "./dynamic-secret-lease-types";

type TDynamicSecretLeaseQueueServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  dynamicSecretLeaseDAL: Pick<TDynamicSecretLeaseDALFactory, "findById" | "deleteById" | "find" | "updateById">;
  dynamicSecretDAL: Pick<TDynamicSecretDALFactory, "findById" | "deleteById" | "updateById">;
  dynamicSecretProviders: Record<DynamicSecretProviders, TDynamicProviderFns>;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  folderDAL: Pick<TSecretFolderDALFactory, "findById">;
};

export type TDynamicSecretLeaseQueueServiceFactory = {
  pruneDynamicSecret: (dynamicSecretCfgId: string) => Promise<void>;
  setLeaseRevocation: (leaseId: string, expiryAt: Date) => Promise<void>;
  unsetLeaseRevocation: (leaseId: string) => Promise<void>;
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
        if (!dynamicSecretLease) throw new DisableRotationErrors({ message: "Dynamic secret lease not found" });

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
      logger.error(error);

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
      }
      if (error instanceof DisableRotationErrors) {
        if (jobId) {
          await queueService.stopRepeatableJobByJobId(QueueName.DynamicSecretRevocation, jobId);
          await queueService.stopJobByIdPg(QueueName.DynamicSecretRevocation, jobId);
        }
      }
      // propogate to next part
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
  };

  return {
    pruneDynamicSecret,
    setLeaseRevocation,
    unsetLeaseRevocation,
    init
  };
};
