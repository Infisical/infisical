import { DisableRotationErrors } from "@app/ee/services/secret-rotation/secret-rotation-queue";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";

import { TDynamicSecretDALFactory } from "../dynamic-secret/dynamic-secret-dal";
import { DynamicSecretStatus } from "../dynamic-secret/dynamic-secret-types";
import { DynamicSecretProviders, TDynamicProviderFns } from "../dynamic-secret/providers/models";
import { TDynamicSecretLeaseDALFactory } from "./dynamic-secret-lease-dal";

type TDynamicSecretLeaseQueueServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  dynamicSecretLeaseDAL: Pick<TDynamicSecretLeaseDALFactory, "findById" | "deleteById" | "find" | "updateById">;
  dynamicSecretDAL: Pick<TDynamicSecretDALFactory, "findById" | "deleteById" | "updateById">;
  dynamicSecretProviders: Record<DynamicSecretProviders, TDynamicProviderFns>;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  folderDAL: Pick<TSecretFolderDALFactory, "findById">;
};

export type TDynamicSecretLeaseQueueServiceFactory = ReturnType<typeof dynamicSecretLeaseQueueServiceFactory>;

export const dynamicSecretLeaseQueueServiceFactory = ({
  queueService,
  dynamicSecretDAL,
  dynamicSecretProviders,
  dynamicSecretLeaseDAL,
  kmsService,
  folderDAL
}: TDynamicSecretLeaseQueueServiceFactoryDep) => {
  const pruneDynamicSecret = async (dynamicSecretCfgId: string) => {
    await queueService.queue(
      QueueName.DynamicSecretRevocation,
      QueueJobs.DynamicSecretPruning,
      { dynamicSecretCfgId },
      {
        jobId: dynamicSecretCfgId,
        backoff: {
          type: "exponential",
          delay: 3000
        },
        removeOnFail: {
          count: 3
        },
        removeOnComplete: true
      }
    );
  };

  const setLeaseRevocation = async (leaseId: string, expiry: number) => {
    await queueService.queue(
      QueueName.DynamicSecretRevocation,
      QueueJobs.DynamicSecretRevocation,
      { leaseId },
      {
        jobId: leaseId,
        backoff: {
          type: "exponential",
          delay: 3000
        },
        delay: expiry,
        removeOnFail: {
          count: 3
        },
        removeOnComplete: true
      }
    );
  };

  const unsetLeaseRevocation = async (leaseId: string) => {
    await queueService.stopJobById(QueueName.DynamicSecretRevocation, leaseId);
  };

  queueService.start(QueueName.DynamicSecretRevocation, async (job) => {
    try {
      if (job.name === QueueJobs.DynamicSecretRevocation) {
        const { leaseId } = job.data as { leaseId: string };
        logger.info("Dynamic secret lease revocation started: ", leaseId, job.id);

        const dynamicSecretLease = await dynamicSecretLeaseDAL.findById(leaseId);
        if (!dynamicSecretLease) throw new DisableRotationErrors({ message: "Dynamic secret lease not found" });

        const dynamicSecretCfg = dynamicSecretLease.dynamicSecret;
        const folder = await folderDAL.findById(dynamicSecretCfg.folderId);
        if (!folder) throw new DisableRotationErrors({ message: "Folder not found" });
        const { projectId } = folder;

        const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
          type: KmsDataKey.SecretManager,
          projectId
        });

        const dynamicSecretInputConfig = secretManagerDecryptor({
          cipherTextBlob: dynamicSecretCfg.encryptedConfig
        }).toString();
        const selectedProvider = dynamicSecretProviders[dynamicSecretCfg.type as DynamicSecretProviders];
        const decryptedStoredInput = JSON.parse(dynamicSecretInputConfig) as object;

        await selectedProvider.revoke(decryptedStoredInput, dynamicSecretLease.externalEntityId);
        await dynamicSecretLeaseDAL.deleteById(dynamicSecretLease.id);
        return;
      }

      if (job.name === QueueJobs.DynamicSecretPruning) {
        const { dynamicSecretCfgId } = job.data as { dynamicSecretCfgId: string };
        logger.info("Dynamic secret pruning started: ", dynamicSecretCfgId, job.id);
        const dynamicSecretCfg = await dynamicSecretDAL.findById(dynamicSecretCfgId);
        if (!dynamicSecretCfg) throw new DisableRotationErrors({ message: "Dynamic secret not found" });
        if ((dynamicSecretCfg.status as DynamicSecretStatus) !== DynamicSecretStatus.Deleting)
          throw new DisableRotationErrors({ message: "Document not deleted" });

        const folder = await folderDAL.findById(dynamicSecretCfg.folderId);
        if (!folder) throw new DisableRotationErrors({ message: "Folder not found" });
        const { projectId } = folder;
        const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
          type: KmsDataKey.SecretManager,
          projectId
        });

        const dynamicSecretLeases = await dynamicSecretLeaseDAL.find({ dynamicSecretId: dynamicSecretCfgId });
        if (dynamicSecretLeases.length) {
          const selectedProvider = dynamicSecretProviders[dynamicSecretCfg.type as DynamicSecretProviders];

          const dynamicSecretInputConfig = secretManagerDecryptor({
            cipherTextBlob: dynamicSecretCfg.encryptedConfig
          }).toString();
          const decryptedStoredInput = JSON.parse(dynamicSecretInputConfig) as object;

          await Promise.all(dynamicSecretLeases.map(({ id }) => unsetLeaseRevocation(id)));
          await Promise.all(
            dynamicSecretLeases.map(({ externalEntityId }) =>
              selectedProvider.revoke(decryptedStoredInput, externalEntityId)
            )
          );
        }

        await dynamicSecretDAL.deleteById(dynamicSecretCfgId);
      }
      logger.info("Finished dynamic secret job", job.id);
    } catch (error) {
      logger.error(error);

      if (job?.name === QueueJobs.DynamicSecretPruning) {
        const { dynamicSecretCfgId } = job.data as { dynamicSecretCfgId: string };
        await dynamicSecretDAL.updateById(dynamicSecretCfgId, {
          status: DynamicSecretStatus.FailedDeletion,
          statusDetails: (error as Error)?.message?.slice(0, 255)
        });
      }

      if (job?.name === QueueJobs.DynamicSecretRevocation) {
        const { leaseId } = job.data as { leaseId: string };
        await dynamicSecretLeaseDAL.updateById(leaseId, {
          status: DynamicSecretStatus.FailedDeletion,
          statusDetails: (error as Error)?.message?.slice(0, 255)
        });
      }
      if (error instanceof DisableRotationErrors) {
        if (job.id) {
          await queueService.stopRepeatableJobByJobId(QueueName.DynamicSecretRevocation, job.id);
        }
      }
      // propogate to next part
      throw error;
    }
  });

  return {
    pruneDynamicSecret,
    setLeaseRevocation,
    unsetLeaseRevocation
  };
};
