import { randomUUID } from "crypto";
import pLimit from "p-limit";

import { SecretEncryptionAlgo, SecretKeyEncoding } from "@app/db/schemas";
import { EventType, SecretApprovalEvent, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TSecretApprovalRequestServiceFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-service";
import { crypto } from "@app/lib/crypto/cryptography";
import { logger } from "@app/lib/logger";
import { recordLegacyRootKeyUsageMetric } from "@app/lib/telemetry/metrics";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { TFolderCommitServiceFactory } from "../folder-commit/folder-commit-service";
import { TKmsServiceFactory } from "../kms/kms-service";
import { TNotificationServiceFactory } from "../notification/notification-service";
import { NotificationType } from "../notification/notification-types";
import { TProjectDALFactory } from "../project/project-dal";
import { TProjectServiceFactory } from "../project/project-service";
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TProjectEnvServiceFactory } from "../project-env/project-env-service";
import { TResourceMetadataDALFactory } from "../resource-metadata/resource-metadata-dal";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretFolderVersionDALFactory } from "../secret-folder/secret-folder-version-dal";
import { TSecretTagDALFactory } from "../secret-tag/secret-tag-dal";
import { TSecretV2BridgeDALFactory } from "../secret-v2-bridge/secret-v2-bridge-dal";
import { TSecretV2BridgeServiceFactory } from "../secret-v2-bridge/secret-v2-bridge-service";
import { TSecretVersionV2DALFactory } from "../secret-v2-bridge/secret-version-dal";
import { TSecretVersionV2TagDALFactory } from "../secret-v2-bridge/secret-version-tag-dal";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { importDataIntoInfisicalFn } from "./external-migration-fns";
import {
  ExternalPlatforms,
  TImportInfisicalDataCreate,
  TVaultImportSideEffectsJobPayload
} from "./external-migration-types";

const VAULT_IMPORT_SIDE_EFFECT_CONCURRENCY = 10;

export type TExternalMigrationQueueFactoryDep = {
  smtpService: TSmtpService;
  queueService: TQueueServiceFactory;

  projectDAL: Pick<TProjectDALFactory, "transaction">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "find" | "findLastEnvPosition" | "create" | "findOne">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;

  secretDAL: Pick<TSecretV2BridgeDALFactory, "insertMany" | "upsertSecretReferences" | "findBySecretKeys" | "find">;
  secretVersionDAL: Pick<TSecretVersionV2DALFactory, "insertMany" | "create">;
  secretTagDAL: Pick<TSecretTagDALFactory, "saveTagsToSecretV2" | "create" | "find">;
  secretVersionTagDAL: Pick<TSecretVersionV2TagDALFactory, "insertMany" | "create">;

  folderDAL: Pick<TSecretFolderDALFactory, "create" | "findBySecretPath" | "findOne" | "findById">;
  projectService: Pick<TProjectServiceFactory, "createProject">;
  projectEnvService: Pick<TProjectEnvServiceFactory, "createEnvironment">;
  secretV2BridgeService: Pick<TSecretV2BridgeServiceFactory, "createManySecret" | "dispatchSecretCreateSideEffects">;
  folderCommitService: Pick<TFolderCommitServiceFactory, "createCommit">;
  folderVersionDAL: Pick<TSecretFolderVersionDALFactory, "create">;

  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "insertMany" | "delete">;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
  secretApprovalRequestService: Pick<
    TSecretApprovalRequestServiceFactory,
    "dispatchSecretApprovalRequestCreateSideEffects"
  >;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
};

export type TExternalMigrationQueueFactory = ReturnType<typeof externalMigrationQueueFactory>;

export const externalMigrationQueueFactory = ({
  queueService,
  projectService,
  smtpService,
  projectDAL,
  projectEnvService,
  secretV2BridgeService,
  kmsService,
  projectEnvDAL,
  secretDAL,
  secretVersionDAL,
  secretTagDAL,
  secretVersionTagDAL,
  folderDAL,
  folderCommitService,
  folderVersionDAL,
  resourceMetadataDAL,
  notificationService,
  secretApprovalRequestService,
  auditLogService
}: TExternalMigrationQueueFactoryDep) => {
  const startImport = async (dto: {
    orgId: string;
    actorId: string;
    actorEmail: string;
    importType: ExternalPlatforms;
    data: {
      iv: string;
      tag: string;
      ciphertext: string;
      algorithm: SecretEncryptionAlgo;
      encoding: SecretKeyEncoding;
    };
  }) => {
    await queueService.queue(
      QueueName.ImportSecretsFromExternalSource,
      QueueJobs.ImportSecretsFromExternalSource,
      dto,
      {
        removeOnComplete: true,
        removeOnFail: true,
        jobId: randomUUID()
      }
    );
  };

  queueService.start(QueueName.ImportSecretsFromExternalSource, async (job) => {
    const { data, actorEmail, importType, actorId, orgId } = job.data;

    try {
      await notificationService.createUserNotifications([
        {
          userId: actorId,
          orgId,
          type: NotificationType.IMPORT_STARTED,
          title: "Import Started",
          body: `An import from **${importType}** to Infisical has been started.`
        }
      ]);

      await smtpService.sendMail({
        recipients: [actorEmail],
        subjectLine: "Infisical import started",
        substitutions: {
          provider: importType
        },
        template: SmtpTemplates.ExternalImportStarted
      });

      recordLegacyRootKeyUsageMetric({ operation: "decrypt", surface: "external_migration" });
      const decrypted = crypto.encryption().symmetric().decryptWithRootEncryptionKey({
        ciphertext: data.ciphertext,
        iv: data.iv,
        keyEncoding: data.encoding,
        tag: data.tag
      });

      const decryptedJson = JSON.parse(decrypted) as TImportInfisicalDataCreate;

      const { projectsNotImported } = await importDataIntoInfisicalFn({
        input: decryptedJson,
        projectDAL,
        projectEnvDAL,
        secretDAL,
        secretVersionDAL,
        secretTagDAL,
        secretVersionTagDAL,
        folderDAL,
        kmsService,
        projectService,
        projectEnvService,
        secretV2BridgeService,
        folderCommitService,
        folderVersionDAL,
        resourceMetadataDAL
      });

      if (projectsNotImported.length) {
        logger.info(
          {
            actorEmail,
            actorOrgId: decryptedJson.actorOrgId,
            projectsNotImported
          },
          "One or more projects were not imported during import from external source"
        );
      }

      await notificationService.createUserNotifications([
        {
          userId: actorId,
          orgId,
          type: NotificationType.IMPORT_SUCCESSFUL,
          title: "Import Successful",
          body: `An import from **${importType}** to Infisical has successfully completed.`
        }
      ]);

      await smtpService.sendMail({
        recipients: [actorEmail],
        subjectLine: "Infisical import successful",
        substitutions: {
          provider: importType
        },
        template: SmtpTemplates.ExternalImportSuccessful
      });
    } catch (err) {
      await notificationService.createUserNotifications([
        {
          userId: actorId,
          orgId,
          type: NotificationType.IMPORT_FAILED,
          title: "Import Failed",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
          body: `An import from **${importType}** to Infisical has failed: ${(err as any)?.message || "Unknown error"}.`
        }
      ]);

      await smtpService.sendMail({
        recipients: [job.data.actorEmail],
        subjectLine: "Infisical import failed",
        substitutions: {
          provider: importType,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
          error: (err as any)?.message || "Unknown error"
        },
        template: SmtpTemplates.ExternalImportFailed
      });

      logger.error(err, "Failed to import data from external source");
    }
  });

  const enqueueVaultImportSideEffects = async (payload: TVaultImportSideEffectsJobPayload) => {
    await queueService.queue(QueueName.VaultImportSideEffects, QueueJobs.VaultImportSideEffects, payload, {
      jobId: `vault-import-side-effects-${randomUUID()}`,
      removeOnComplete: true,
      removeOnFail: true,
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 3000
      }
    });
  };

  queueService.start(
    QueueName.VaultImportSideEffects,
    async (job) => {
      const {
        projectId,
        environment,
        environmentName,
        actor,
        actorId,
        actorOrgId,
        auditLogInfo,
        writtenFolders,
        approvedFolders
      } = job.data;

      const sideEffectLimit = pLimit(VAULT_IMPORT_SIDE_EFFECT_CONCURRENCY);

      await Promise.all(
        writtenFolders.map(({ folderPath, secretKeys }) =>
          sideEffectLimit(async () => {
            try {
              await secretV2BridgeService.dispatchSecretCreateSideEffects({
                projectId,
                orgId: actorOrgId,
                actor,
                actorId,
                environmentSlug: environment,
                environmentName,
                secretPath: folderPath,
                secretKeys
              });
            } catch (error) {
              logger.error(
                error,
                `Failed to dispatch Vault import secret side effects [secretPath=${folderPath}] [projectId=${projectId}]`
              );
            }
          })
        )
      );

      await Promise.all(
        approvedFolders.map(({ folderPath, secretKeys, approval }) =>
          sideEffectLimit(async () => {
            try {
              await secretApprovalRequestService.dispatchSecretApprovalRequestCreateSideEffects({
                secretApprovalRequest: {
                  id: approval.id,
                  policyId: approval.policyId,
                  commits: approval.commits
                },
                projectId,
                environment,
                secretPath: folderPath,
                secretKeys,
                actor,
                actorId,
                actorOrgId
              });
            } catch (error) {
              // rethrown so the job's retries apply: a reviewer who never hears about the request is worse than a
              // duplicate notification, and this is the only delivery attempt left once the import has responded
              logger.error(
                error,
                `Failed to notify approvers of Vault import change request [requestId=${approval.id}] [secretPath=${folderPath}]`
              );
              throw error;
            }
          })
        )
      );

      await Promise.all(
        approvedFolders.map(({ folderPath, secretKeys, approval }) =>
          sideEffectLimit(async () => {
            try {
              await auditLogService.createAuditLog({
                projectId,
                ...auditLogInfo,
                event: {
                  type: EventType.SECRET_APPROVAL_REQUEST,
                  metadata: {
                    committedBy: approval.committerUserId,
                    secretApprovalRequestId: approval.id,
                    secretApprovalRequestSlug: approval.slug,
                    secretPath: folderPath,
                    environment,
                    secrets: secretKeys.map((secretKey) => ({ secretKey })),
                    eventType: SecretApprovalEvent.CreateMany
                  }
                }
              });
            } catch (error) {
              logger.error(
                error,
                `Failed to write Vault import change request audit log [requestId=${approval.id}] [secretPath=${folderPath}]`
              );
            }
          })
        )
      );
    },
    { concurrency: 5 }
  );

  return {
    startImport,
    enqueueVaultImportSideEffects
  };
};
