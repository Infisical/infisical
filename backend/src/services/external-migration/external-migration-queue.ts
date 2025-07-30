import { SecretEncryptionAlgo, SecretKeyEncoding } from "@app/db/schemas";
import { crypto } from "@app/lib/crypto/cryptography";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { TFolderCommitServiceFactory } from "../folder-commit/folder-commit-service";
import { TKmsServiceFactory } from "../kms/kms-service";
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
import { ExternalPlatforms, ImportType, TImportInfisicalDataCreate } from "./external-migration-types";

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
  secretV2BridgeService: Pick<TSecretV2BridgeServiceFactory, "createManySecret">;
  folderCommitService: Pick<TFolderCommitServiceFactory, "createCommit">;
  folderVersionDAL: Pick<TSecretFolderVersionDALFactory, "create">;

  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "insertMany" | "delete">;
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
  resourceMetadataDAL
}: TExternalMigrationQueueFactoryDep) => {
  const startImport = async (dto: {
    actorEmail: string;
    data: {
      importType: ImportType;
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
        removeOnFail: true
      }
    );
  };

  queueService.start(QueueName.ImportSecretsFromExternalSource, async (job) => {
    try {
      const { data, actorEmail } = job.data;

      await smtpService.sendMail({
        recipients: [actorEmail],
        subjectLine: "Infisical import started",
        substitutions: {
          provider: ExternalPlatforms.EnvKey
        },
        template: SmtpTemplates.ExternalImportStarted
      });

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

      await smtpService.sendMail({
        recipients: [actorEmail],
        subjectLine: "Infisical import successful",
        substitutions: {
          provider: ExternalPlatforms.EnvKey
        },
        template: SmtpTemplates.ExternalImportSuccessful
      });
    } catch (err) {
      await smtpService.sendMail({
        recipients: [job.data.actorEmail],
        subjectLine: "Infisical import failed",
        substitutions: {
          provider: ExternalPlatforms.EnvKey,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
          error: (err as any)?.message || "Unknown error"
        },
        template: SmtpTemplates.ExternalImportFailed
      });

      logger.error(err, "Failed to import data from external source");
    }
  });
  return {
    startImport
  };
};
