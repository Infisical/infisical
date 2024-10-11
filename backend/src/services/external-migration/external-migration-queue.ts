import { SecretEncryptionAlgo, SecretKeyEncoding } from "@app/db/schemas";
import { infisicalSymmetricDecrypt } from "@app/lib/crypto/encryption";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { TOrgServiceFactory } from "../org/org-service";
import { TProjectServiceFactory } from "../project/project-service";
import { TProjectEnvServiceFactory } from "../project-env/project-env-service";
import { TSecretV2BridgeServiceFactory } from "../secret-v2-bridge/secret-v2-bridge-service";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { importDataIntoInfisicalFn } from "./external-migration-fns";
import { ExternalPlatforms, TImportInfisicalDataCreate } from "./external-migration-types";

export type TExternalMigrationQueueFactoryDep = {
  projectService: Pick<TProjectServiceFactory, "createProject">;
  orgService: Pick<TOrgServiceFactory, "inviteUserToOrganization">;
  projectEnvService: Pick<TProjectEnvServiceFactory, "createEnvironment">;
  secretV2BridgeService: Pick<TSecretV2BridgeServiceFactory, "createManySecret">;

  smtpService: TSmtpService;
  queueService: TQueueServiceFactory;
};

export type TExternalMigrationQueueFactory = ReturnType<typeof externalMigrationQueueFactory>;

export const externalMigrationQueueFactory = ({
  queueService,
  projectService,
  orgService,
  smtpService,
  projectEnvService,
  secretV2BridgeService
}: TExternalMigrationQueueFactoryDep) => {
  const startImport = async (dto: {
    actorEmail: string;
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

      const decrypted = infisicalSymmetricDecrypt({
        ciphertext: data.ciphertext,
        iv: data.iv,
        keyEncoding: data.encoding,
        tag: data.tag
      });

      const decryptedJson = JSON.parse(decrypted) as TImportInfisicalDataCreate;

      await importDataIntoInfisicalFn({
        input: decryptedJson,
        projectService,
        orgService,
        projectEnvService,
        secretV2BridgeService
      });

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
