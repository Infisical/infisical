import { ProjectMembershipRole } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { applyJitter } from "@app/lib/delay";
import { DisableRotationErrors, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import {
  recordDynamicSecretOrphanedLeaseMetric,
  recordDynamicSecretRevocationOutcomeMetric
} from "@app/lib/telemetry/metrics";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TProjectMembershipDALFactory } from "@app/services/project-membership/project-membership-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TDynamicSecretDALFactory } from "../dynamic-secret/dynamic-secret-dal";
import { DynamicSecretStatus } from "../dynamic-secret/dynamic-secret-types";
import { DynamicSecretProviders, TDynamicProviderFns } from "../dynamic-secret/providers/models";
import { TDynamicSecretLeaseDALFactory } from "./dynamic-secret-lease-dal";
import { decryptLeaseData, recordDynamicSecretRevocationResult } from "./dynamic-secret-lease-fns";
import { TDynamicSecretLeaseConfig } from "./dynamic-secret-lease-types";

type TDynamicSecretLeaseQueueServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  dynamicSecretLeaseDAL: Pick<TDynamicSecretLeaseDALFactory, "findById" | "deleteById" | "find" | "updateById">;
  smtpService: Pick<TSmtpService, "sendMail">;
  userDAL: Pick<TUserDALFactory, "findById">;
  identityDAL: TIdentityDALFactory;
  dynamicSecretDAL: Pick<TDynamicSecretDALFactory, "findById" | "deleteById" | "updateById" | "update" | "findOne">;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "findAllProjectMembers">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  dynamicSecretProviders: Record<DynamicSecretProviders, TDynamicProviderFns>;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  folderDAL: Pick<TSecretFolderDALFactory, "findById" | "findSecretPathByFolderIds">;
};

export type TDynamicSecretLeaseQueueServiceFactory = {
  pruneDynamicSecret: (dynamicSecretCfgId: string) => Promise<void>;
  setLeaseRevocation: (leaseId: string, dynamicSecretId: string, expiryAt: Date) => Promise<void>;
  unsetLeaseRevocation: (leaseId: string) => Promise<void>;
  queueFailedRevocation: (leaseId: string, dynamicSecretId: string) => Promise<void>;
};

const MAX_REVOCATION_RETRY_COUNT = 3;

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

    const retryDelaySeconds = appConfig.isDevelopmentMode ? 1 : Math.floor(applyJitter(3_600_000 * 4) / 1000); // retry every 4 hours with 20% +- jitter

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
        jobId: `dynamic-secret-lease-revocation-failure-email-${dynamicSecretId}-${leaseId}`,
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

  const $recordPruningOutcomes = (provider: string, revoked: boolean[], attemptsExhausted: boolean) => {
    revoked.forEach((isRevoked) =>
      recordDynamicSecretRevocationOutcomeMetric({
        provider,
        trigger: "pruning",
        outcome: isRevoked ? "success" : "failure",
        attemptsExhausted
      })
    );
  };

  const $dynamicSecretQueueJob = async (
    jobName: string,
    jobId: string,
    data: { leaseId: string; dynamicSecretId: string; isRetry?: boolean } | { dynamicSecretCfgId: string },
    retryCount?: number,
    maxAttempts = 1
  ): Promise<void> => {
    let providerType: string | undefined;
    let configId: string | undefined;
    let wasFailing = false;
    const isFinalAttempt = retryCount !== undefined && retryCount >= maxAttempts;
    // Per-lease revoke results of this pruning run, so a failed run reports each lease once.
    let pruningRevoked: boolean[] | undefined;
    try {
      if (jobName === QueueJobs.DynamicSecretRevocation) {
        const { leaseId, isRetry } = data as { leaseId: string; isRetry?: boolean };
        logger.info("Dynamic secret lease revocation started: ", leaseId, jobId);

        const dynamicSecretLease = await dynamicSecretLeaseDAL.findById(leaseId);
        if (!dynamicSecretLease) {
          return;
        }

        const dynamicSecretCfg = dynamicSecretLease.dynamicSecret;
        providerType = dynamicSecretCfg.type;
        configId = dynamicSecretCfg.id;
        wasFailing = dynamicSecretCfg.revocationFailing;

        const folder = await folderDAL.findById(dynamicSecretCfg.folderId);
        if (!folder) {
          logger.info(`Failed to find folder with ${dynamicSecretCfg.folderId}`);
          return;
        }

        const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
          type: KmsDataKey.SecretManager,
          projectId: folder.projectId
        });

        const selectedProvider = dynamicSecretProviders[dynamicSecretCfg.type as DynamicSecretProviders];
        const decryptedStoredInput = JSON.parse(
          secretManagerDecryptor({ cipherTextBlob: dynamicSecretCfg.encryptedInput }).toString()
        ) as object;

        await selectedProvider.revoke(
          decryptedStoredInput,
          dynamicSecretLease.externalEntityId,
          {
            projectId: folder.projectId,
            leaseData: decryptLeaseData(secretManagerDecryptor, dynamicSecretLease.encryptedLeaseData)
          },
          dynamicSecretLease.config as TDynamicSecretLeaseConfig
        );
        await dynamicSecretLeaseDAL.deleteById(dynamicSecretLease.id);

        recordDynamicSecretRevocationOutcomeMetric({
          provider: providerType,
          trigger: isRetry ? "retry" : "scheduled",
          outcome: "success",
          attemptsExhausted: isFinalAttempt
        });
        await recordDynamicSecretRevocationResult({
          dynamicSecretDAL,
          dynamicSecretId: configId,
          provider: providerType,
          isRevoked: true,
          wasFailing
        });
        return;
      }

      if (jobName === QueueJobs.DynamicSecretPruning) {
        const { dynamicSecretCfgId } = data as { dynamicSecretCfgId: string };
        logger.info("Dynamic secret pruning started: ", dynamicSecretCfgId, jobId);
        const dynamicSecretCfg = await dynamicSecretDAL.findById(dynamicSecretCfgId);
        if (!dynamicSecretCfg) {
          logger.info(`Failed to find dynamic secret with ${dynamicSecretCfgId}`);
          return;
        }
        providerType = dynamicSecretCfg.type;
        if ((dynamicSecretCfg.status as DynamicSecretStatus) !== DynamicSecretStatus.Deleting) {
          logger.info(`Dynamic secret ${dynamicSecretCfgId} is not in deleting status`);
          return;
        }

        const folder = await folderDAL.findById(dynamicSecretCfg.folderId);
        if (!folder) {
          logger.info(`Failed to find folder with ${dynamicSecretCfg.folderId}`);
          return;
        }

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

          // Best-effort: stopping partway must not skip the revokes below, or leases whose scheduled job was already
          // removed would be left unrevoked and uncounted. A lease whose job survives is revoked here anyway.
          const cancellations = await Promise.allSettled(dynamicSecretLeases.map(({ id }) => unsetLeaseRevocation(id)));
          cancellations.forEach((cancellation, index) => {
            if (cancellation.status === "rejected") {
              logger.warn(
                cancellation.reason,
                `Failed to cancel scheduled revocation while pruning [leaseId=${dynamicSecretLeases[index].id}]`
              );
            }
          });
          const revocations = await Promise.allSettled(
            dynamicSecretLeases.map(async ({ externalEntityId, config, encryptedLeaseData }) =>
              selectedProvider.revoke(
                decryptedStoredInput,
                externalEntityId,
                {
                  projectId: folder.projectId,
                  leaseData: decryptLeaseData(secretManagerDecryptor, encryptedLeaseData)
                },
                config as TDynamicSecretLeaseConfig
              )
            )
          );
          pruningRevoked = revocations.map((revocation) => revocation.status === "fulfilled");

          const failedRevocation = revocations.find(
            (revocation): revocation is PromiseRejectedResult => revocation.status === "rejected"
          );
          if (failedRevocation) throw failedRevocation.reason;
        }

        await dynamicSecretDAL.deleteById(dynamicSecretCfgId);

        if (pruningRevoked) $recordPruningOutcomes(providerType, pruningRevoked, isFinalAttempt);
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
        if (providerType && pruningRevoked && !(error instanceof DisableRotationErrors)) {
          $recordPruningOutcomes(providerType, pruningRevoked, true);

          const unrevokedLeaseCount = pruningRevoked.filter((isRevoked) => !isRevoked).length;
          if (unrevokedLeaseCount > 0) {
            recordDynamicSecretOrphanedLeaseMetric({ provider: providerType, count: unrevokedLeaseCount });
          }
        }
      }

      if (jobName === QueueJobs.DynamicSecretRevocation) {
        const { leaseId, isRetry, dynamicSecretId } = data as {
          leaseId: string;
          isRetry?: boolean;
          dynamicSecretId: string;
        };
        const isRevocationFailure = !(error instanceof DisableRotationErrors);

        // A scheduled revocation reports one outcome per lease: the final attempt's, since BullMQ retries it.
        if (providerType && isRevocationFailure && (isRetry || isFinalAttempt)) {
          recordDynamicSecretRevocationOutcomeMetric({
            provider: providerType,
            trigger: isRetry ? "retry" : "scheduled",
            outcome: "failure",
            attemptsExhausted: isFinalAttempt
          });
          if (!isRetry && configId) {
            await recordDynamicSecretRevocationResult({
              dynamicSecretDAL,
              dynamicSecretId: configId,
              provider: providerType,
              isRevoked: false,
              wasFailing
            });
          }
        }

        if (!isRetry && isRevocationFailure && isFinalAttempt) {
          await queueFailedRevocation(leaseId, dynamicSecretId);
        }

        try {
          await dynamicSecretLeaseDAL.updateById(leaseId, {
            status: DynamicSecretStatus.FailedDeletion,
            statusDetails: `${(error as Error)?.message?.slice(0, 255)} - Retrying automatically`
          });
        } catch (statusError) {
          logger.error(statusError, `Failed to mark dynamic secret lease as failed to revoke [leaseId=${leaseId}]`);
        }

        // if its the last attempt, and the error isn't a DisableRotationErrors error, send an email to the project admins (debounced)
        if (isRetry && isRevocationFailure) {
          if (isFinalAttempt) {
            // if all retries fail, we should also stop the automatic revocation job.
            // the ID of the revocation job is set to the leaseId, so we can use that to stop the job

            // we dont have to stop the retry job, because if we hit this point, its the last attempt and BullMQ will stop it after this point
            await queueService.stopJobById(QueueName.DynamicSecretRevocation, leaseId);

            if (providerType) {
              recordDynamicSecretOrphanedLeaseMetric({ provider: providerType });
            }

            await $queueDynamicSecretLeaseRevocationFailedEmail(leaseId, dynamicSecretId);
          }
        }
      }
      if (error instanceof DisableRotationErrors) {
        if (jobId) {
          await queueService.stopJobById(QueueName.DynamicSecretRevocation, jobId);
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

      const [folderWithPath] = await folderDAL.findSecretPathByFolderIds(folder.projectId, [folder.id]);
      const secretPath = folderWithPath?.path ?? "/";

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
          dynamicSecretLeaseUrl: `${appCfg.SITE_URL}/organizations/${project.orgId}/projects/secret-management/${project.id}/overview?search=${encodeURIComponent(lease.dynamicSecret.name)}&secretPath=${encodeURIComponent(secretPath)}&environments=${folder.environment.envSlug}&filterBy=dynamic&dynamicSecretId=${lease.dynamicSecret.id}`,
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
          await queueService.stopJobById(QueueName.DynamicSecretLeaseRevocationFailedEmail, jobId);
        }
      } else {
        throw error;
      }
    }
  };

  queueService.start(QueueName.DynamicSecretRevocation, async (job) => {
    await $dynamicSecretQueueJob(job.name, job.id as string, job.data, job.attemptsMade + 1, job.opts.attempts);
  });

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
