import { ProjectMembershipRole } from "@app/db/schemas";
import { DisableRotationErrors } from "@app/ee/services/secret-rotation/secret-rotation-queue";
import { getConfig } from "@app/lib/config/env";
import { applyJitter } from "@app/lib/delay";
import { NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectMembershipDALFactory } from "@app/services/project-membership/project-membership-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
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
  dynamicSecretDAL: Pick<TDynamicSecretDALFactory, "findById" | "deleteById" | "updateById" | "findOne">;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "findAllProjectMembers">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  dynamicSecretProviders: Record<DynamicSecretProviders, TDynamicProviderFns>;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  folderDAL: Pick<TSecretFolderDALFactory, "findById">;
};

export type TDynamicSecretLeaseQueueServiceFactory = {
  pruneDynamicSecret: (dynamicSecretCfgId: string) => Promise<void>;
  setLeaseRevocation: (leaseId: string, dynamicSecretId: string, expiryAt: Date) => Promise<void>;
  unsetLeaseRevocation: (leaseId: string) => Promise<void>;
  queueFailedRevocation: (leaseId: string, dynamicSecretId: string) => Promise<void>;
};

const MAX_REVOCATION_RETRY_COUNT = 10;

export const dynamicSecretLeaseQueueServiceFactory = ({
  queueService,
  dynamicSecretDAL,
  dynamicSecretProviders,
  dynamicSecretLeaseDAL,
  kmsService,
  folderDAL,
  projectMembershipDAL,
  projectDAL,
  smtpService
}: TDynamicSecretLeaseQueueServiceFactoryDep): TDynamicSecretLeaseQueueServiceFactory => {
  const pruneDynamicSecret = async (dynamicSecretCfgId: string) => {
    await queueService.queue(
      QueueName.DynamicSecretRevocation,
      QueueJobs.DynamicSecretPruning,
      { dynamicSecretCfgId },
      {
        jobId: `dynamic-secret-lease-pruning-${dynamicSecretCfgId}`,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000 * 60 // 1 minute
        }
      }
    );
  };

  const setLeaseRevocation = async (leaseId: string, dynamicSecretId: string, expiryAt: Date) => {
    await queueService.queue(
      QueueName.DynamicSecretRevocation,
      QueueJobs.DynamicSecretRevocation,
      { leaseId, dynamicSecretId },
      {
        jobId: leaseId,
        delay: Number(expiryAt) - Date.now(),
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000 * 60 // 1 minute
        }
      }
    );
  };

  const unsetLeaseRevocation = async (leaseId: string) => {
    await queueService.stopJobById(QueueName.DynamicSecretRevocation, leaseId);
  };

  const queueFailedRevocation = async (leaseId: string, dynamicSecretId: string) => {
    const appConfig = getConfig();

    const retryDelaySeconds = appConfig.isDevelopmentMode ? 1 : Math.floor(applyJitter(3_600_000 * 4) / 1000); // retry every 4 hours with 20% +- jitter (convert ms to seconds for pgboss)

    await queueService.queue(
      QueueName.DynamicSecretRevocation,
      QueueJobs.DynamicSecretRevocation,
      { leaseId, isRetry: true, dynamicSecretId },
      {
        jobId: `${leaseId}-retry`, // avoid conflicts with scheduled revocation
        attempts: MAX_REVOCATION_RETRY_COUNT,
        backoff: {
          type: "exponential",
          delay: 1000 * retryDelaySeconds
        }
      }
    );
  };

  const $queueDynamicSecretLeaseRevocationFailedEmail = async (leaseId: string, dynamicSecretId: string) => {
    const appConfig = getConfig();

    const delay = appConfig.isDevelopmentMode ? 1_000 * 60 : 1_000 * 60 * 15; // 1 minute in development, 15 minutes in production

    await queueService.queue(
      QueueName.DynamicSecretLeaseRevocationFailedEmail,
      QueueJobs.DynamicSecretLeaseRevocationFailedEmail,
      {
        leaseId
      },
      {
        jobId: `dynamic-secret-lease-revocation-failed-email-${dynamicSecretId}`,
        delay,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000 * 60 // 1 minute
        },
        removeOnComplete: true,
        removeOnFail: true
      }
    );
  };

  const $dynamicSecretQueueJob = async (
    jobName: string,
    jobId: string,
    data: { leaseId: string; dynamicSecretId: string; isRetry?: boolean } | { dynamicSecretCfgId: string },
    retryCount?: number
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
        const { leaseId, isRetry, dynamicSecretId } = data as {
          leaseId: string;
          isRetry?: boolean;
          dynamicSecretId: string;
        };
        await dynamicSecretLeaseDAL.updateById(leaseId, {
          status: DynamicSecretStatus.FailedDeletion,
          statusDetails: `${(error as Error)?.message?.slice(0, 255)} - Retrying automatically`
        });

        // only add to retry queue if this is not a retry, and if the error is not a DisableRotationErrors error
        if (!isRetry && !(error instanceof DisableRotationErrors)) {
          // if revocation fails, we should stop the job and queue a new job to retry the revocation at a later time.
          await queueService.stopRepeatableJobByJobId(QueueName.DynamicSecretRevocation, jobId);
          await queueFailedRevocation(leaseId, dynamicSecretId);

          // if its the last attempt, and the error isn't a DisableRotationErrors error, send an email to the project admins (debounced)
        } else if (isRetry && !(error instanceof DisableRotationErrors)) {
          if (retryCount && retryCount === MAX_REVOCATION_RETRY_COUNT) {
            // if all retries fail, we should also stop the automatic revocation job.
            // the ID of the revocation job is set to the leaseId, so we can use that to stop the job

            // we dont have to stop the retry job, because if we hit this point, its the last attempt and the retry job will be stopped by pgboss itself after this point,
            await queueService.stopRepeatableJobByJobId(QueueName.DynamicSecretRevocation, leaseId);

            await $queueDynamicSecretLeaseRevocationFailedEmail(leaseId, dynamicSecretId);
          }
        }
      }
      if (error instanceof DisableRotationErrors) {
        if (jobId) {
          await queueService.stopRepeatableJobByJobId(QueueName.DynamicSecretRevocation, jobId);
        }
      } else {
        // propagate to next part
        throw error;
      }
    }
  };

  // send alert email once all revocation attempts have failed
  const $dynamicSecretLeaseRevocationFailedEmailJob = async (jobId: string, data: { leaseId: string }) => {
    try {
      const appCfg = getConfig();

      const { leaseId } = data;
      logger.info(
        { leaseId, jobId },
        "Dynamic secret revocation failed. Notifying project admins about failed revocation."
      );

      const lease = await dynamicSecretLeaseDAL.findById(leaseId);
      if (!lease) {
        throw new DisableRotationErrors({ message: "Dynamic secret lease not found" });
      }

      const folder = await folderDAL.findById(lease.dynamicSecret.folderId);
      if (!folder) throw new NotFoundError({ message: `Failed to find folder with ${lease.dynamicSecret.folderId}` });

      const project = await projectDAL.findById(folder.projectId);
      const projectMembers = await projectMembershipDAL.findAllProjectMembers(project.id);

      const projectAdmins = projectMembers.filter((member) =>
        member.roles.some((role) => role.role === ProjectMembershipRole.Admin)
      );

      await smtpService.sendMail({
        recipients: projectAdmins.map((member) => member.user.email!).filter(Boolean),
        template: SmtpTemplates.DynamicSecretLeaseRevocationFailed,
        subjectLine: "Dynamic Secret Lease Revocation Failed",
        substitutions: {
          dynamicSecretLeaseUrl: `${appCfg.SITE_URL}/organizations/${project.orgId}/projects/secret-management/${project.id}/secrets/${folder.environment.envSlug}?dynamicSecretId=${lease.dynamicSecret.id}&filterBy=dynamic&search=${lease.dynamicSecret.name}`,
          dynamicSecretName: lease.dynamicSecret.name,
          projectName: project.name,
          environmentSlug: folder.environment.envSlug,
          errorMessage: lease.statusDetails || "An unknown error occurred"
        }
      });
    } catch (error) {
      logger.error(error, "Failed to send dynamic secret lease revocation failed email");
      if (error instanceof DisableRotationErrors) {
        if (jobId) {
          await queueService.stopRepeatableJobByJobId(QueueName.DynamicSecretLeaseRevocationFailedEmail, jobId);
          await queueService.stopJobById(QueueName.DynamicSecretLeaseRevocationFailedEmail, jobId);
        }
      } else {
        throw error;
      }
    }
  };

  queueService.start(
    QueueName.DynamicSecretRevocation,
    async (job) => {
      await $dynamicSecretQueueJob(job.name, job.id as string, job.data);
    },
    {
      persistence: true
    }
  );

  // we use redis for sending the email because:
  // 1. we are insensitive to losing the jobs in queue in case of a disaster event
  // 2. pgboss does not support exclusive job keys on v0.10.x, and upgrading to v0.11.x which supports exclusive jobs comes with a lot of breaking changes, and we would need to manually migrate our existing jobs to the new version
  queueService.start(QueueName.DynamicSecretLeaseRevocationFailedEmail, async (job) => {
    await $dynamicSecretLeaseRevocationFailedEmailJob(job.id as string, job.data);
  });

  return {
    pruneDynamicSecret,
    setLeaseRevocation,
    unsetLeaseRevocation,
    queueFailedRevocation
  };
};
