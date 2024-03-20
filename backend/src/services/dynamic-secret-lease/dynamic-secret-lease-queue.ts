import { SecretKeyEncoding } from "@app/db/schemas";
import { DisableRotationErrors } from "@app/ee/services/secret-rotation/secret-rotation-queue";
import { infisicalSymmetricDecrypt } from "@app/lib/crypto/encryption";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { TDynamicSecretDALFactory } from "../dynamic-secret/dynamic-secret-dal";
import { DynamicSecretProviders, TDynamicProviderFns } from "../dynamic-secret/providers/models";
import { TDynamicSecretLeaseDALFactory } from "./dynamic-secret-lease-dal";

type TDynamicSecretLeaseQueueServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  dynamicSecretLeaseDAL: Pick<TDynamicSecretLeaseDALFactory, "findById" | "deleteById" | "find">;
  dynamicSecretDAL: Pick<TDynamicSecretDALFactory, "findById" | "deleteById">;
  dynamicSecretProviders: Record<DynamicSecretProviders, TDynamicProviderFns>;
};

export type TDynamicSecretLeaseQueueServiceFactory = ReturnType<typeof dynamicSecretLeaseQueueServiceFactory>;

export const dynamicSecretLeaseQueueServiceFactory = ({
  queueService,
  dynamicSecretDAL,
  dynamicSecretProviders,
  dynamicSecretLeaseDAL
}: TDynamicSecretLeaseQueueServiceFactoryDep) => {
  const pruneDynamicSecret = async (dynamicSecretCfgId: string) => {
    await queueService.queue(
      QueueName.DynamicSecretRevocation,
      QueueJobs.DynamicSecretPruning,
      { dynamicSecretCfgId },
      {
        jobId: dynamicSecretCfgId,
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

        const dynamicSecretCfg = await dynamicSecretDAL.findById(dynamicSecretLease.dynamicSecretId);
        if (!dynamicSecretCfg) throw new DisableRotationErrors({ message: "Dynamic secret not found" });

        const selectedProvider = dynamicSecretProviders[dynamicSecretCfg.type as DynamicSecretProviders];
        const decryptedStoredInput = JSON.parse(
          infisicalSymmetricDecrypt({
            keyEncoding: dynamicSecretCfg.keyEncoding as SecretKeyEncoding,
            ciphertext: dynamicSecretCfg.inputCiphertext,
            tag: dynamicSecretCfg.inputTag,
            iv: dynamicSecretCfg.inputIV
          })
        ) as object;

        await selectedProvider.revoke(decryptedStoredInput, dynamicSecretLease.externalEntityId);
        await dynamicSecretLeaseDAL.deleteById(dynamicSecretLease.id);
        return;
      }

      if (job.name === QueueJobs.DynamicSecretPruning) {
        const { dynamicSecretCfgId } = job.data as { dynamicSecretCfgId: string };
        logger.info("Dynamic secret pruning started: ", dynamicSecretCfgId, job.id);
        const dynamicSecretCfg = await dynamicSecretDAL.findById(dynamicSecretCfgId);
        if (!dynamicSecretCfg) throw new DisableRotationErrors({ message: "Dynamic secret not found" });
        if (!dynamicSecretCfg.isDeleting) throw new DisableRotationErrors({ message: "Document not deleted" });

        const dynamicSecretLeases = await dynamicSecretLeaseDAL.find({ dynamicSecretId: dynamicSecretCfgId });
        if (dynamicSecretLeases.length) throw new DisableRotationErrors({ message: "Dynamic secret lease not found" });

        const selectedProvider = dynamicSecretProviders[dynamicSecretCfg.type as DynamicSecretProviders];
        const decryptedStoredInput = JSON.parse(
          infisicalSymmetricDecrypt({
            keyEncoding: dynamicSecretCfg.keyEncoding as SecretKeyEncoding,
            ciphertext: dynamicSecretCfg.inputCiphertext,
            tag: dynamicSecretCfg.inputTag,
            iv: dynamicSecretCfg.inputIV
          })
        ) as object;

        await Promise.allSettled(dynamicSecretLeases.map(({ id }) => unsetLeaseRevocation(id)));
        await Promise.allSettled(
          dynamicSecretLeases.map(({ externalEntityId }) =>
            selectedProvider.revoke(decryptedStoredInput, externalEntityId)
          )
        );

        await dynamicSecretDAL.deleteById(dynamicSecretCfgId);
      }
      logger.info("Finished dynamic secret job", job.id);
    } catch (error) {
      if (error instanceof DisableRotationErrors) {
        if (job.id) {
          await queueService.stopRepeatableJobByJobId(QueueName.DynamicSecretRevocation, job.id);
        }
      }
    }
  });

  queueService.listen(QueueName.AuditLogPrune, "failed", (err) => {
    logger.error(err, `${QueueName.AuditLogPrune}: log pruning failed`);
  });

  return {
    pruneDynamicSecret,
    setLeaseRevocation,
    unsetLeaseRevocation
  };
};
