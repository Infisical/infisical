/* eslint-disable no-await-in-loop */
import { getConfig } from "@app/lib/config/env";
import { decryptSymmetric128BitHexKeyUTF8 } from "@app/lib/crypto";
import { daysToMillisecond, secondsToMillis } from "@app/lib/dates";
import { BadRequestError } from "@app/lib/errors";
import { groupBy, isSamePath, unique } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TProjectBotDALFactory } from "@app/services/project-bot/project-bot-dal";
import { createManySecretsRawFnFactory, updateManySecretsRawFnFactory } from "@app/services/secret/secret-fns";
import { TSecretVersionDALFactory } from "@app/services/secret/secret-version-dal";
import { TSecretVersionTagDALFactory } from "@app/services/secret/secret-version-tag-dal";
import { TSecretBlindIndexDALFactory } from "@app/services/secret-blind-index/secret-blind-index-dal";
import { TSecretTagDALFactory } from "@app/services/secret-tag/secret-tag-dal";

import { TIntegrationDALFactory } from "../integration/integration-dal";
import { TIntegrationAuthServiceFactory } from "../integration-auth/integration-auth-service";
import { syncIntegrationSecrets } from "../integration-auth/integration-sync-secret";
import { TOrgDALFactory } from "../org/org-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { TProjectBotServiceFactory } from "../project-bot/project-bot-service";
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TProjectMembershipDALFactory } from "../project-membership/project-membership-dal";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretImportDALFactory } from "../secret-import/secret-import-dal";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { TWebhookDALFactory } from "../webhook/webhook-dal";
import { fnTriggerWebhook } from "../webhook/webhook-fns";
import { TSecretDALFactory } from "./secret-dal";
import { interpolateSecrets } from "./secret-fns";
import { TCreateSecretReminderDTO, THandleReminderDTO, TRemoveSecretReminderDTO } from "./secret-types";

export type TSecretQueueFactory = ReturnType<typeof secretQueueFactory>;
type TSecretQueueFactoryDep = {
  queueService: TQueueServiceFactory;
  integrationDAL: Pick<TIntegrationDALFactory, "findByProjectIdV2" | "updateById">;
  projectBotService: Pick<TProjectBotServiceFactory, "getBotKey">;
  integrationAuthService: Pick<TIntegrationAuthServiceFactory, "getIntegrationAccessToken">;
  folderDAL: TSecretFolderDALFactory;
  secretDAL: TSecretDALFactory;
  secretImportDAL: Pick<TSecretImportDALFactory, "find">;
  webhookDAL: Pick<TWebhookDALFactory, "findAllWebhooks" | "transaction" | "update" | "bulkUpdate">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
  projectDAL: TProjectDALFactory;
  projectBotDAL: TProjectBotDALFactory;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "findAllProjectMembers">;
  smtpService: TSmtpService;
  orgDAL: Pick<TOrgDALFactory, "findOrgByProjectId">;
  secretVersionDAL: TSecretVersionDALFactory;
  secretBlindIndexDAL: TSecretBlindIndexDALFactory;
  secretTagDAL: TSecretTagDALFactory;
  secretVersionTagDAL: TSecretVersionTagDALFactory;
};

export type TGetSecrets = {
  secretPath: string;
  projectId: string;
  environment: string;
};

const MAX_SYNC_SECRET_DEPTH = 5;

export const secretQueueFactory = ({
  queueService,
  integrationDAL,
  projectBotService,
  integrationAuthService,
  secretDAL,
  secretImportDAL,
  folderDAL,
  webhookDAL,
  projectEnvDAL,
  orgDAL,
  smtpService,
  projectDAL,
  projectBotDAL,
  projectMembershipDAL,
  secretVersionDAL,
  secretBlindIndexDAL,
  secretTagDAL,
  secretVersionTagDAL
}: TSecretQueueFactoryDep) => {
  const createManySecretsRawFn = createManySecretsRawFnFactory({
    projectDAL,
    projectBotDAL,
    secretDAL,
    secretVersionDAL,
    secretBlindIndexDAL,
    secretTagDAL,
    secretVersionTagDAL,
    folderDAL
  });

  const updateManySecretsRawFn = updateManySecretsRawFnFactory({
    projectDAL,
    projectBotDAL,
    secretDAL,
    secretVersionDAL,
    secretBlindIndexDAL,
    secretTagDAL,
    secretVersionTagDAL,
    folderDAL
  });

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

  const syncSecrets = async (dto: TGetSecrets & { depth?: number }) => {
    logger.info(
      `Syncing secrets Project: ${dto.projectId} - Environment: ${dto.environment} - Path: ${dto.secretPath}`
    );
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
        every: appCfg.NODE_ENV === "development" ? secondsToMillis(dto.repeatDays) : daysToMillisecond(dto.repeatDays)
      },
      `reminder-${dto.secretId}`
    );
  };

  const addSecretReminder = async ({ oldSecret, newSecret, projectId }: TCreateSecretReminderDTO) => {
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
                : daysToMillisecond(newSecret.secretReminderRepeatDays),
            immediately: true
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
        (secretReminderRepeatDays && oldSecret.secretReminderRepeatDays !== secretReminderRepeatDays) ||
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

  type Content = Record<string, { value: string; comment?: string; skipMultilineEncoding?: boolean }>;

  /**
   * Return the secrets in a given [folderId] including secrets from
   * nested imported folders recursively.
   */
  const getIntegrationSecrets = async (dto: {
    projectId: string;
    environment: string;
    folderId: string;
    key: string;
    depth: number;
  }) => {
    let content: Content = {};
    if (dto.depth > MAX_SYNC_SECRET_DEPTH) return content;

    // process secrets in current folder
    const secrets = await secretDAL.findByFolderId(dto.folderId);
    secrets.forEach((secret) => {
      const secretKey = decryptSymmetric128BitHexKeyUTF8({
        ciphertext: secret.secretKeyCiphertext,
        iv: secret.secretKeyIV,
        tag: secret.secretKeyTag,
        key: dto.key
      });

      const secretValue = decryptSymmetric128BitHexKeyUTF8({
        ciphertext: secret.secretValueCiphertext,
        iv: secret.secretValueIV,
        tag: secret.secretValueTag,
        key: dto.key
      });

      content[secretKey] = { value: secretValue };

      if (secret.secretCommentCiphertext && secret.secretCommentIV && secret.secretCommentTag) {
        const commentValue = decryptSymmetric128BitHexKeyUTF8({
          ciphertext: secret.secretCommentCiphertext,
          iv: secret.secretCommentIV,
          tag: secret.secretCommentTag,
          key: dto.key
        });
        content[secretKey].comment = commentValue;
      }

      content[secretKey].skipMultilineEncoding = Boolean(secret.skipMultilineEncoding);
    });

    const expandSecrets = interpolateSecrets({
      projectId: dto.projectId,
      secretEncKey: dto.key,
      folderDAL,
      secretDAL
    });

    await expandSecrets(content);

    // check if current folder has any imports from other folders
    const secretImport = await secretImportDAL.find({ folderId: dto.folderId });

    // if no imports then return secrets in the current folder
    if (!secretImport) return content;

    const importedFolders = await folderDAL.findByManySecretPath(
      secretImport.map(({ importEnv, importPath }) => ({
        envId: importEnv.id,
        secretPath: importPath
      }))
    );

    for await (const folder of importedFolders) {
      if (folder) {
        // get secrets contained in each imported folder by recursively calling
        // this function against the imported folder
        const importedSecrets = await getIntegrationSecrets({
          environment: dto.environment,
          projectId: dto.projectId,
          folderId: folder.id,
          key: dto.key,
          depth: dto.depth + 1
        });

        // add the imported secrets to the current folder secrets
        content = { ...content, ...importedSecrets };
      }
    }

    return content;
  };

  queueService.start(QueueName.IntegrationSync, async (job) => {
    const { environment, projectId, secretPath, depth = 1 } = job.data;

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder) {
      logger.error(new Error("Secret path not found"));
      return;
    }

    // start syncing all linked imports also
    if (depth < MAX_SYNC_SECRET_DEPTH) {
      // find all imports made with the given environment and secret path
      const linkSourceDto = {
        projectId,
        importEnv: folder.environment.id,
        importPath: secretPath
      };
      const imports = await secretImportDAL.find(linkSourceDto);

      if (imports.length) {
        // keep calling sync secret for all the imports made
        const importedFolderIds = unique(imports, (i) => i.folderId).map(({ folderId }) => folderId);
        const importedFolders = await folderDAL.findSecretPathByFolderIds(projectId, importedFolderIds);
        const foldersGroupedById = groupBy(importedFolders, (i) => i.child || i.id);
        await Promise.all(
          imports
            .filter(({ folderId }) => Boolean(foldersGroupedById[folderId][0].path))
            .map(({ folderId }) => {
              const syncDto = {
                depth: depth + 1,
                projectId,
                secretPath: foldersGroupedById[folderId][0].path,
                environment: foldersGroupedById[folderId][0].environmentSlug
              };
              logger.info({ sourceLink: linkSourceDto, destination: syncDto }, `Syncing secret due to link change`);
              return syncSecrets(syncDto);
            })
        );
      }
    }

    const integrations = await integrationDAL.findByProjectIdV2(projectId, environment); // note: returns array of integrations + integration auths in this environment
    const toBeSyncedIntegrations = integrations.filter(
      // note: sync only the integrations sourced from secretPath
      ({ secretPath: integrationSecPath, isActive }) => isActive && isSamePath(secretPath, integrationSecPath)
    );

    if (!integrations.length) return;
    logger.info({ source: job.data }, "Secret integration sync started - %s", job.id);
    for (const integration of toBeSyncedIntegrations) {
      const integrationAuth = {
        ...integration.integrationAuth,
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId: integration.projectId
      };

      const botKey = await projectBotService.getBotKey(projectId);
      const { accessToken, accessId } = await integrationAuthService.getIntegrationAccessToken(integrationAuth, botKey);
      const secrets = await getIntegrationSecrets({
        environment,
        projectId,
        folderId: folder.id,
        key: botKey,
        depth: 1
      });
      const suffixedSecrets: typeof secrets = {};
      const metadata = integration.metadata as Record<string, string>;
      if (metadata) {
        Object.keys(secrets).forEach((key) => {
          const prefix = metadata?.secretPrefix || "";
          const suffix = metadata?.secretSuffix || "";
          const newKey = prefix + key + suffix;
          suffixedSecrets[newKey] = secrets[key];
        });
      }

      await syncIntegrationSecrets({
        createManySecretsRawFn,
        updateManySecretsRawFn,
        integrationDAL,
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

    logger.info("Secret integration sync ended: %s", job.id);
  });

  queueService.start(QueueName.SecretReminder, async ({ data }) => {
    logger.info(`secretReminderQueue.process: [secretDocument=${data.secretId}]`);

    const { projectId } = data;

    const organization = await orgDAL.findOrgByProjectId(projectId);
    const project = await projectDAL.findById(projectId);

    if (!organization) {
      logger.info(`secretReminderQueue.process: [secretDocument=${data.secretId}] no organization found`);
      return;
    }

    if (!project) {
      logger.info(`secretReminderQueue.process: [secretDocument=${data.secretId}] no project found`);
      return;
    }

    const projectMembers = await projectMembershipDAL.findAllProjectMembers(projectId);

    if (!projectMembers || !projectMembers.length) {
      logger.info(`secretReminderQueue.process: [secretDocument=${data.secretId}] no project members found`);
      return;
    }

    await smtpService.sendMail({
      template: SmtpTemplates.SecretReminder,
      subjectLine: "Infisical secret reminder",
      recipients: [...projectMembers.map((m) => m.user.email)].filter((email) => email).map((email) => email as string),
      substitutions: {
        reminderNote: data.note, // May not be present.
        projectName: project.name,
        organizationName: organization.name
      }
    });
  });

  queueService.listen(QueueName.IntegrationSync, "failed", (job, err) => {
    logger.error(err, "Failed to sync integration %s", job?.id);
  });

  queueService.start(QueueName.SecretWebhook, async (job) => {
    await fnTriggerWebhook({ ...job.data, projectEnvDAL, webhookDAL });
  });

  return {
    // depth is internal only field thus no need to make it available outside
    syncSecrets: (dto: TGetSecrets) => syncSecrets(dto),
    syncIntegrations,
    addSecretReminder,
    removeSecretReminder,
    handleSecretReminder
  };
};
