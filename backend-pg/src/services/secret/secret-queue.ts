/* eslint-disable no-await-in-loop */
import { getConfig } from "@app/lib/config/env";
import { decryptSymmetric128BitHexKeyUTF8 } from "@app/lib/crypto";
import { daysToMillisecond, secondsToMillis } from "@app/lib/dates";
import { BadRequestError } from "@app/lib/errors";
import { isSamePath } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { TIntegrationDALFactory } from "../integration/integration-dal";
import { TIntegrationAuthServiceFactory } from "../integration-auth/integration-auth-service";
import { syncIntegrationSecrets } from "../integration-auth/integration-sync-secret";
import { TProjectBotServiceFactory } from "../project-bot/project-bot-service";
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretImportDALFactory } from "../secret-import/secret-import-dal";
import { fnSecretsFromImports } from "../secret-import/secret-import-fns";
import { TWebhookDALFactory } from "../webhook/webhook-dal";
import { fnTriggerWebhook } from "../webhook/webhook-fns";
import { TSecretDALFactory } from "./secret-dal";
import { interpolateSecrets } from "./secret-fns";
import {
  TCreateSecretReminderDTO,
  THandleReminderDTO,
  TRemoveSecretReminderDTO
} from "./secret-types";

export type TSecretQueueFactory = ReturnType<typeof secretQueueFactory>;

type TSecretQueueFactoryDep = {
  queueService: TQueueServiceFactory;
  integrationDAL: Pick<TIntegrationDALFactory, "findByProjectIdV2">;
  projectBotService: Pick<TProjectBotServiceFactory, "getBotKey">;
  integrationAuthService: Pick<TIntegrationAuthServiceFactory, "getIntegrationAccessToken">;
  folderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath" | "findByManySecretPath">;
  secretDAL: Pick<TSecretDALFactory, "findByFolderId" | "find">;
  secretImportDAL: Pick<TSecretImportDALFactory, "find">;
  webhookDAL: Pick<TWebhookDALFactory, "findAllWebhooks" | "transaction" | "update" | "bulkUpdate">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
};

export type TGetSecrets = {
  secretPath: string;
  projectId: string;
  environment: string;
};

export const secretQueueFactory = ({
  queueService,
  integrationDAL,
  projectBotService,
  integrationAuthService,
  secretDAL,
  secretImportDAL,
  folderDAL,
  webhookDAL,
  projectEnvDAL
}: TSecretQueueFactoryDep) => {
  const syncIntegrations = async (dto: TGetSecrets) => {
    await queueService.queue(QueueName.IntegrationSync, QueueJobs.IntegrationSync, dto, {
      attempts: 5,
      delay: 1000,
      backoff: {
        type: "exponential",
        delay: 3000
      },
      removeOnComplete: true,
      removeOnFail: {
        count: 5 // keep the most recent  jobs
      }
    });
  };

  const syncSecrets = async (dto: TGetSecrets) => {
    await queueService.queue(QueueName.SecretWebhook, QueueJobs.SecWebhook, dto, {
      jobId: `secret-webhook-${dto.environment}-${dto.projectId}-${dto.secretPath}`,
      removeOnFail: { count: 5 },
      removeOnComplete: true,
      delay: 1000,
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 3000
      }
    });
    await syncIntegrations(dto);
  };

  const removeSecretReminder = async (dto: TRemoveSecretReminderDTO) => {
    const appCfg = getConfig();
    await queueService.stopRepeatableJob(
      QueueName.SecretReminder,
      QueueJobs.SecretReminder,
      {
        // on prod it this will be in days, in development this will be second
        every:
          appCfg.NODE_ENV === "development"
            ? secondsToMillis(dto.repeatDays)
            : daysToMillisecond(dto.repeatDays)
      },
      `reminder-${dto.secretId}`
    );
  };

  const addSecretReminder = async ({
    oldSecret,
    newSecret,
    projectId
  }: TCreateSecretReminderDTO) => {
    try {
      const appCfg = getConfig();

      if (oldSecret.id !== newSecret.id) {
        throw new BadRequestError({
          name: "SecretReminderIdMismatch",
          message: "Existing secret didn't match the updated secret ID."
        });
      }

      if (!newSecret.secretReminderRepeatDays) {
        throw new BadRequestError({
          name: "SecretReminderRepeatDaysMissing",
          message: "Secret reminder repeat days is missing."
        });
      }

      // If the secret already has a reminder, we should remove the existing one first.
      if (oldSecret.secretReminderRepeatDays) {
        await removeSecretReminder({
          repeatDays: oldSecret.secretReminderRepeatDays,
          secretId: oldSecret.id
        });
      }

      await queueService.queue(
        QueueName.SecretReminder,
        QueueJobs.SecretReminder,
        {
          note: newSecret.secretReminderNote,
          projectId,
          repeatDays: newSecret.secretReminderRepeatDays,
          secretId: newSecret.id
        },
        {
          jobId: `reminder-${newSecret.id}`,
          repeat: {
            // on prod it this will be in days, in development this will be second
            every:
              appCfg.NODE_ENV === "development"
                ? secondsToMillis(newSecret.secretReminderRepeatDays)
                : daysToMillisecond(newSecret.secretReminderRepeatDays)
          }
        }
      );
    } catch (err) {
      logger.error(err, "Failed to create secret reminder.");
      throw new BadRequestError({
        name: "SecretReminderCreateFailed",
        message: "Failed to create secret reminder."
      });
    }
  };

  const handleSecretReminder = async ({ newSecret, oldSecret, projectId }: THandleReminderDTO) => {
    const { secretReminderRepeatDays, secretReminderNote } = newSecret;

    if (newSecret.type !== "personal" && secretReminderRepeatDays !== undefined) {
      if (
        (secretReminderRepeatDays &&
          oldSecret.secretReminderRepeatDays !== secretReminderRepeatDays) ||
        (secretReminderNote && oldSecret.secretReminderNote !== secretReminderNote)
      ) {
        await addSecretReminder({
          oldSecret,
          newSecret,
          projectId
        });
      } else if (
        secretReminderRepeatDays === null &&
        secretReminderNote === null &&
        oldSecret.secretReminderRepeatDays
      ) {
        await removeSecretReminder({
          secretId: oldSecret.id,
          repeatDays: oldSecret.secretReminderRepeatDays
        });
      }
    }
  };

  const getIntegrationSecrets = async (dto: TGetSecrets & { folderId: string }, key: string) => {
    const secrets = await secretDAL.findByFolderId(dto.folderId);
    if (!secrets.length) return {};

    // get imported secrets
    const secretImport = await secretImportDAL.find({ folderId: dto.folderId });
    const importedSecrets = await fnSecretsFromImports({
      allowedImports: secretImport,
      secretDAL,
      folderDAL
    });
    const content: Record<
      string,
      { value: string; comment?: string; skipMultilineEncoding?: boolean }
    > = {};

    importedSecrets.forEach(({ secrets: secs }) => {
      secs.forEach((secret) => {
        const secretKey = decryptSymmetric128BitHexKeyUTF8({
          ciphertext: secret.secretKeyCiphertext,
          iv: secret.secretKeyIV,
          tag: secret.secretKeyTag,
          key
        });
        const secretValue = decryptSymmetric128BitHexKeyUTF8({
          ciphertext: secret.secretValueCiphertext,
          iv: secret.secretValueIV,
          tag: secret.secretValueTag,
          key
        });
        content[secretKey] = { value: secretValue };
        content[secretKey].skipMultilineEncoding = Boolean(secret.skipMultilineEncoding);

        if (secret.secretCommentCiphertext && secret.secretCommentIV && secret.secretCommentTag) {
          const commentValue = decryptSymmetric128BitHexKeyUTF8({
            ciphertext: secret.secretCommentCiphertext,
            iv: secret.secretCommentIV,
            tag: secret.secretCommentTag,
            key
          });
          content[secretKey].comment = commentValue;
        }
      });
    });
    secrets.forEach((secret) => {
      const secretKey = decryptSymmetric128BitHexKeyUTF8({
        ciphertext: secret.secretKeyCiphertext,
        iv: secret.secretKeyIV,
        tag: secret.secretKeyTag,
        key
      });

      const secretValue = decryptSymmetric128BitHexKeyUTF8({
        ciphertext: secret.secretValueCiphertext,
        iv: secret.secretValueIV,
        tag: secret.secretValueTag,
        key
      });

      content[secretKey] = { value: secretValue };

      if (secret.secretCommentCiphertext && secret.secretCommentIV && secret.secretCommentTag) {
        const commentValue = decryptSymmetric128BitHexKeyUTF8({
          ciphertext: secret.secretCommentCiphertext,
          iv: secret.secretCommentIV,
          tag: secret.secretCommentTag,
          key
        });
        content[secretKey].comment = commentValue;
      }

      content[secretKey].skipMultilineEncoding = Boolean(secret.skipMultilineEncoding);
    });
    const expandSecrets = interpolateSecrets({
      projectId: dto.projectId,
      secretEncKey: key,
      folderDAL,
      secretDAL
    });
    await expandSecrets(content);
    return content;
  };

  queueService.start(QueueName.IntegrationSync, async (job) => {
    const { environment, projectId, secretPath } = job.data;
    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder) {
      logger.error("Secret path not found");
      return;
    }

    const integrations = await integrationDAL.findByProjectIdV2(projectId, environment);
    const toBeSyncedIntegrations = integrations.filter(
      ({ secretPath: integrationSecPath, isActive }) =>
        isActive && isSamePath(secretPath, integrationSecPath)
    );

    if (!integrations.length) return;
    logger.info("Secret integration sync started", job.data, job.id);
    for (const integration of toBeSyncedIntegrations) {
      const integrationAuth = {
        ...integration.integrationAuth,
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId: integration.projectId
      };

      const botKey = await projectBotService.getBotKey(projectId);
      const { accessToken, accessId } = await integrationAuthService.getIntegrationAccessToken(
        integrationAuth,
        botKey
      );
      const secrets = await getIntegrationSecrets(
        { environment, projectId, secretPath, folderId: folder.id },
        botKey
      );
      const suffixedSecrets: typeof secrets = {};
      const metadata = integration.metadata as Record<string, any>;
      if (metadata) {
        Object.keys(secrets).forEach((key) => {
          const prefix = metadata?.secretPrefix || "";
          const suffix = metadata?.secretSuffix || "";
          const newKey = prefix + key + suffix;
          suffixedSecrets[newKey] = secrets[key];
        });
      }

      await syncIntegrationSecrets({
        integration,
        integrationAuth,
        secrets: Object.keys(suffixedSecrets).length !== 0 ? suffixedSecrets : secrets,
        accessId: accessId as string,
        accessToken,
        appendices: {
          prefix: metadata?.secretPrefix || "",
          suffix: metadata?.secretSuffix || ""
        }
      });
    }

    logger.info("Secret integration sync ended", job.id);
  });

  queueService.listen(QueueName.IntegrationSync, "failed", (job, err) => {
    logger.error("Failed to sync integration", job?.data, err);
  });

  queueService.start(QueueName.SecretWebhook, async (job) => {
    await fnTriggerWebhook({ ...job.data, projectEnvDAL, webhookDAL });
  });

  return {
    syncSecrets,
    syncIntegrations,
    addSecretReminder,
    removeSecretReminder,
    handleSecretReminder
  };
};
