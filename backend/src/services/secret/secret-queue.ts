/* eslint-disable no-await-in-loop */
import { AxiosError } from "axios";

import { ProjectUpgradeStatus, ProjectVersion } from "@app/db/schemas";
import { TSecretRotationDALFactory } from "@app/ee/services/secret-rotation/secret-rotation-dal";
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
import { TIntegrationAuthDALFactory } from "../integration-auth/integration-auth-dal";
import { TIntegrationAuthServiceFactory } from "../integration-auth/integration-auth-service";
import { syncIntegrationSecrets } from "../integration-auth/integration-sync-secret";
import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TOrgDALFactory } from "../org/org-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { TProjectBotServiceFactory } from "../project-bot/project-bot-service";
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TProjectMembershipDALFactory } from "../project-membership/project-membership-dal";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretImportDALFactory } from "../secret-import/secret-import-dal";
import { TSecretV2BridgeDALFactory } from "../secret-v2-bridge/secret-v2-bridge-dal";
import { getAllNestedSecretReferences } from "../secret-v2-bridge/secret-v2-bridge-fns";
import { TSecretVersionV2DALFactory } from "../secret-v2-bridge/secret-version-dal";
import { TSecretVersionV2TagDALFactory } from "../secret-v2-bridge/secret-version-tag-dal";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { TWebhookDALFactory } from "../webhook/webhook-dal";
import { fnTriggerWebhook } from "../webhook/webhook-fns";
import { TSecretDALFactory } from "./secret-dal";
import { interpolateSecrets } from "./secret-fns";
import {
  TCreateSecretReminderDTO,
  THandleReminderDTO,
  TRemoveSecretReminderDTO,
  TSyncSecretsDTO
} from "./secret-types";

export type TSecretQueueFactory = ReturnType<typeof secretQueueFactory>;
type TSecretQueueFactoryDep = {
  queueService: TQueueServiceFactory;
  integrationDAL: Pick<TIntegrationDALFactory, "findByProjectIdV2" | "updateById">;
  integrationAuthDAL: Pick<TIntegrationAuthDALFactory, "upsert" | "find">;
  projectBotService: Pick<TProjectBotServiceFactory, "getBotKey">;
  integrationAuthService: Pick<TIntegrationAuthServiceFactory, "getIntegrationAccessToken">;
  folderDAL: TSecretFolderDALFactory;
  secretDAL: TSecretDALFactory;
  secretImportDAL: Pick<TSecretImportDALFactory, "find">;
  webhookDAL: Pick<TWebhookDALFactory, "findAllWebhooks" | "transaction" | "update" | "bulkUpdate">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne" | "find">;
  projectDAL: TProjectDALFactory;
  projectBotDAL: TProjectBotDALFactory;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "findAllProjectMembers">;
  smtpService: TSmtpService;
  orgDAL: Pick<TOrgDALFactory, "findOrgByProjectId">;
  secretVersionDAL: TSecretVersionDALFactory;
  secretBlindIndexDAL: TSecretBlindIndexDALFactory;
  secretTagDAL: TSecretTagDALFactory;
  secretVersionTagDAL: TSecretVersionTagDALFactory;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  secretV2BridgeDAL: TSecretV2BridgeDALFactory;
  secretVersionV2BridgeDAL: Pick<TSecretVersionV2DALFactory, "insertMany" | "findLatestVersionMany">;
  secretVersionTagV2BridgeDAL: Pick<TSecretVersionV2TagDALFactory, "insertMany">;
  secretRotationDAL: Pick<TSecretRotationDALFactory, "secretOutputV2InsertMany" | "find">;
};

export type TGetSecrets = {
  secretPath: string;
  projectId: string;
  environment: string;
};

const MAX_SYNC_SECRET_DEPTH = 5;
export const uniqueSecretQueueKey = (environment: string, secretPath: string) =>
  `secret-queue-dedupe-${environment}-${secretPath}`;

type TIntegrationSecret = Record<
  string,
  { value: string; comment?: string; skipMultilineEncoding?: boolean | null | undefined }
>;
export const secretQueueFactory = ({
  queueService,
  integrationDAL,
  integrationAuthDAL,
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
  secretVersionTagDAL,
  secretV2BridgeDAL,
  secretVersionV2BridgeDAL,
  kmsService,
  secretVersionTagV2BridgeDAL,
  secretRotationDAL
}: TSecretQueueFactoryDep) => {
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
  const createManySecretsRawFn = createManySecretsRawFnFactory({
    projectDAL,
    projectBotDAL,
    secretDAL,
    secretVersionDAL,
    secretBlindIndexDAL,
    secretTagDAL,
    secretVersionTagDAL,
    folderDAL,
    kmsService,
    secretVersionV2BridgeDAL,
    secretV2BridgeDAL,
    secretVersionTagV2BridgeDAL
  });

  const updateManySecretsRawFn = updateManySecretsRawFnFactory({
    projectDAL,
    projectBotDAL,
    secretDAL,
    secretVersionDAL,
    secretBlindIndexDAL,
    secretTagDAL,
    secretVersionTagDAL,
    folderDAL,
    kmsService,
    secretVersionV2BridgeDAL,
    secretV2BridgeDAL,
    secretVersionTagV2BridgeDAL
  });

  /**
   * Return the secrets in a given [folderId] including secrets from
   * nested imported folders recursively.
   */
  const getIntegrationSecretsV2 = async (dto: {
    projectId: string;
    environment: string;
    folderId: string;
    depth: number;
    decryptor: (value: Buffer | null | undefined) => string;
  }) => {
    let content: TIntegrationSecret = {};
    if (dto.depth > MAX_SYNC_SECRET_DEPTH) {
      logger.info(
        `getIntegrationSecrets: secret depth exceeded for [projectId=${dto.projectId}] [folderId=${dto.folderId}] [depth=${dto.depth}]`
      );
      return content;
    }

    // process secrets in current folder
    const secrets = await secretV2BridgeDAL.findByFolderId(dto.folderId);
    secrets.forEach((secret) => {
      const secretKey = secret.key;
      const secretValue = dto.decryptor(secret.encryptedValue);
      content[secretKey] = { value: secretValue };

      if (secret.encryptedComment) {
        const commentValue = dto.decryptor(secret.encryptedComment);
        content[secretKey].comment = commentValue;
      }

      content[secretKey].skipMultilineEncoding = Boolean(secret.skipMultilineEncoding);
    });

    // TODO(akhilmhdh-sev2): change this to v2 expand secrets

    // check if current folder has any imports from other folders
    const secretImport = await secretImportDAL.find({ folderId: dto.folderId, isReplication: false });

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
        const importedSecrets = await getIntegrationSecretsV2({
          environment: dto.environment,
          projectId: dto.projectId,
          folderId: folder.id,
          depth: dto.depth + 1,
          decryptor: dto.decryptor
        });

        // add the imported secrets to the current folder secrets
        content = { ...importedSecrets, ...content };
      }
    }

    return content;
  };

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
    let content: TIntegrationSecret = {};
    if (dto.depth > MAX_SYNC_SECRET_DEPTH) {
      logger.info(
        `getIntegrationSecrets: secret depth exceeded for [projectId=${dto.projectId}] [folderId=${dto.folderId}] [depth=${dto.depth}]`
      );
      return content;
    }

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
    const secretImport = await secretImportDAL.find({ folderId: dto.folderId, isReplication: false });

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
        content = { ...importedSecrets, ...content };
      }
    }

    return content;
  };

  const syncIntegrations = async (dto: TGetSecrets & { deDupeQueue?: Record<string, boolean> }) => {
    await queueService.queue(QueueName.IntegrationSync, QueueJobs.IntegrationSync, dto, {
      attempts: 3,
      delay: 1000,
      backoff: {
        type: "exponential",
        delay: 3000
      },
      removeOnComplete: true,
      removeOnFail: true
    });
  };

  const replicateSecrets = async (dto: Omit<TSyncSecretsDTO, "deDupeQueue">) => {
    await queueService.queue(QueueName.SecretReplication, QueueJobs.SecretReplication, dto, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000
      },
      removeOnComplete: true,
      removeOnFail: true
    });
  };

  const syncSecrets = async <T extends boolean = false>({
    // seperate de-dupe queue for integration sync and replication sync
    _deDupeQueue: deDupeQueue = {},
    _depth: depth = 0,
    _deDupeReplicationQueue: deDupeReplicationQueue = {},
    ...dto
  }: TSyncSecretsDTO<T>) => {
    logger.info(
      `syncSecrets: syncing project secrets where [projectId=${dto.projectId}]  [environment=${dto.environmentSlug}] [path=${dto.secretPath}]`
    );
    const deDuplicationKey = uniqueSecretQueueKey(dto.environmentSlug, dto.secretPath);
    if (
      !dto.excludeReplication
        ? deDupeReplicationQueue?.[deDuplicationKey]
        : deDupeQueue?.[deDuplicationKey] || depth > MAX_SYNC_SECRET_DEPTH
    ) {
      return;
    }
    // eslint-disable-next-line
    deDupeQueue[deDuplicationKey] = true;
    // eslint-disable-next-line
    deDupeReplicationQueue[deDuplicationKey] = true;
    await queueService.queue(
      QueueName.SecretSync,
      QueueJobs.SecretSync,
      {
        ...dto,
        _deDupeQueue: deDupeQueue,
        _deDupeReplicationQueue: deDupeReplicationQueue,
        _depth: depth
      } as TSyncSecretsDTO,
      {
        removeOnFail: true,
        removeOnComplete: true,
        delay: 1000,
        attempts: 5,
        backoff: {
          type: "exponential",
          delay: 3000
        }
      }
    );
  };

  queueService.start(QueueName.SecretSync, async (job) => {
    const {
      _deDupeQueue: deDupeQueue,
      _deDupeReplicationQueue: deDupeReplicationQueue,
      _depth: depth,
      secretPath,
      projectId,
      environmentSlug: environment,
      excludeReplication,
      actorId,
      actor
    } = job.data;

    await queueService.queue(
      QueueName.SecretWebhook,
      QueueJobs.SecWebhook,
      { environment, projectId, secretPath },
      {
        jobId: `secret-webhook-${environment}-${projectId}-${secretPath}`,
        removeOnFail: { count: 5 },
        removeOnComplete: true,
        delay: 1000,
        attempts: 5,
        backoff: {
          type: "exponential",
          delay: 3000
        }
      }
    );
    await syncIntegrations({ secretPath, projectId, environment, deDupeQueue });
    if (!excludeReplication) {
      await replicateSecrets({
        _deDupeReplicationQueue: deDupeReplicationQueue,
        _depth: depth,
        projectId,
        secretPath,
        actorId,
        actor,
        excludeReplication,
        environmentSlug: environment
      });
    }
  });

  queueService.start(QueueName.IntegrationSync, async (job) => {
    const { environment, projectId, secretPath, depth = 1, deDupeQueue = {} } = job.data;
    if (depth > MAX_SYNC_SECRET_DEPTH) return;

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder) {
      throw new Error("Secret path not found");
    }

    // find all imports made with the given environment and secret path
    const linkSourceDto = {
      projectId,
      importEnv: folder.environment.id,
      importPath: secretPath,
      isReplication: false
    };
    const imports = await secretImportDAL.find(linkSourceDto);

    if (imports.length) {
      // keep calling sync secret for all the imports made
      const importedFolderIds = unique(imports, (i) => i.folderId).map(({ folderId }) => folderId);
      const importedFolders = await folderDAL.findSecretPathByFolderIds(projectId, importedFolderIds);
      const foldersGroupedById = groupBy(importedFolders.filter(Boolean), (i) => i?.id as string);
      logger.info(
        `getIntegrationSecrets: Syncing secret due to link change [jobId=${job.id}] [projectId=${job.data.projectId}] [environment=${job.data.environment}]  [secretPath=${job.data.secretPath}] [depth=${depth}]`
      );
      await Promise.all(
        imports
          .filter(({ folderId }) => Boolean(foldersGroupedById[folderId][0]?.path as string))
          // filter out already synced ones
          .filter(
            ({ folderId }) =>
              !deDupeQueue[
                uniqueSecretQueueKey(
                  foldersGroupedById[folderId][0]?.environmentSlug as string,
                  foldersGroupedById[folderId][0]?.path as string
                )
              ]
          )
          .map(({ folderId }) =>
            syncSecrets({
              projectId,
              secretPath: foldersGroupedById[folderId][0]?.path as string,
              environmentSlug: foldersGroupedById[folderId][0]?.environmentSlug as string,
              _deDupeQueue: deDupeQueue,
              _depth: depth + 1,
              excludeReplication: true
            })
          )
      );
    }

    const { shouldUseSecretV2Bridge, botKey } = await projectBotService.getBotKey(projectId);
    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });
    let referencedFolderIds;
    if (shouldUseSecretV2Bridge) {
      const secretReferences = await secretV2BridgeDAL.findReferencedSecretReferences(
        projectId,
        folder.environment.slug,
        secretPath
      );
      referencedFolderIds = unique(secretReferences, (i) => i.folderId).map(({ folderId }) => folderId);
    } else {
      const secretReferences = await secretDAL.findReferencedSecretReferences(
        projectId,
        folder.environment.slug,
        secretPath
      );
      referencedFolderIds = unique(secretReferences, (i) => i.folderId).map(({ folderId }) => folderId);
    }
    if (referencedFolderIds.length) {
      const referencedFolders = await folderDAL.findSecretPathByFolderIds(projectId, referencedFolderIds);
      const referencedFoldersGroupedById = groupBy(referencedFolders.filter(Boolean), (i) => i?.id as string);
      logger.info(
        `getIntegrationSecrets: Syncing secret due to reference change [jobId=${job.id}] [projectId=${job.data.projectId}] [environment=${job.data.environment}]  [secretPath=${job.data.secretPath}] [depth=${depth}]`
      );
      await Promise.all(
        referencedFolderIds
          .filter((folderId) => Boolean(referencedFoldersGroupedById[folderId][0]?.path))
          // filter out already synced ones
          .filter(
            (folderId) =>
              !deDupeQueue[
                uniqueSecretQueueKey(
                  referencedFoldersGroupedById[folderId][0]?.environmentSlug as string,
                  referencedFoldersGroupedById[folderId][0]?.path as string
                )
              ]
          )
          .map((folderId) =>
            syncSecrets({
              projectId,
              secretPath: referencedFoldersGroupedById[folderId][0]?.path as string,
              environmentSlug: referencedFoldersGroupedById[folderId][0]?.environmentSlug as string,
              _deDupeQueue: deDupeQueue,
              _depth: depth + 1,
              excludeReplication: true
            })
          )
      );
    }

    const integrations = await integrationDAL.findByProjectIdV2(projectId, environment); // note: returns array of integrations + integration auths in this environment
    const toBeSyncedIntegrations = integrations.filter(
      // note: sync only the integrations sourced from secretPath
      ({ secretPath: integrationSecPath, isActive }) => isActive && isSamePath(secretPath, integrationSecPath)
    );

    if (!integrations.length) return;
    logger.info(
      `getIntegrationSecrets: secret integration sync started [jobId=${job.id}] [jobId=${job.id}] [projectId=${job.data.projectId}] [environment=${job.data.environment}]  [secretPath=${job.data.secretPath}] [depth=${job.data.depth}]`
    );
    for (const integration of toBeSyncedIntegrations) {
      const integrationAuth = {
        ...integration.integrationAuth,
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId: integration.projectId
      };

      const { accessToken, accessId } = await integrationAuthService.getIntegrationAccessToken(
        integrationAuth,
        shouldUseSecretV2Bridge,
        botKey
      );
      let awsAssumeRoleArn = null;
      if (shouldUseSecretV2Bridge) {
        if (integrationAuth.encryptedAwsAssumeIamRoleArn) {
          awsAssumeRoleArn = secretManagerDecryptor({
            cipherTextBlob: Buffer.from(integrationAuth.encryptedAwsAssumeIamRoleArn)
          }).toString();
        }
      } else if (
        integrationAuth.awsAssumeIamRoleArnTag &&
        integrationAuth.awsAssumeIamRoleArnIV &&
        integrationAuth.awsAssumeIamRoleArnCipherText
      ) {
        awsAssumeRoleArn = decryptSymmetric128BitHexKeyUTF8({
          ciphertext: integrationAuth.awsAssumeIamRoleArnCipherText,
          iv: integrationAuth.awsAssumeIamRoleArnIV,
          tag: integrationAuth.awsAssumeIamRoleArnTag,
          key: botKey as string
        });
      }

      const secrets = shouldUseSecretV2Bridge
        ? await getIntegrationSecretsV2({
            environment,
            projectId,
            folderId: folder.id,
            depth: 1,
            decryptor: (value) => (value ? secretManagerDecryptor({ cipherTextBlob: value }).toString() : "")
          })
        : await getIntegrationSecrets({
            environment,
            projectId,
            folderId: folder.id,
            key: botKey as string,
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

      try {
        // akhilmhdh: this needs to changed later to be more easier to use
        // at present this is not at all extendable like to add a new parameter for just one integration need to modify multiple places
        const response = await syncIntegrationSecrets({
          createManySecretsRawFn,
          updateManySecretsRawFn,
          integrationDAL,
          integration,
          integrationAuth,
          secrets: Object.keys(suffixedSecrets).length !== 0 ? suffixedSecrets : secrets,
          accessId: accessId as string,
          awsAssumeRoleArn,
          accessToken,
          projectId,
          appendices: {
            prefix: metadata?.secretPrefix || "",
            suffix: metadata?.secretSuffix || ""
          }
        });

        await integrationDAL.updateById(integration.id, {
          lastSyncJobId: job.id,
          lastUsed: new Date(),
          syncMessage: response?.syncMessage ?? "",
          isSynced: response?.isSynced ?? true
        });
      } catch (err) {
        logger.info("Secret integration sync error: %o", err);

        const message =
          (err instanceof AxiosError ? JSON.stringify(err?.response?.data) : (err as Error)?.message) ||
          "Unknown error occurred.";

        await integrationDAL.updateById(integration.id, {
          lastSyncJobId: job.id,
          lastUsed: new Date(),
          syncMessage: message,
          isSynced: false
        });
      }
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

  const startSecretV2Migration = async (projectId: string) => {
    await queueService.queue(
      QueueName.ProjectV3Migration,
      QueueJobs.ProjectV3Migration,
      { projectId },
      {
        attempts: 2,
        backoff: {
          type: "exponential",
          delay: 3000
        },
        removeOnComplete: true,
        removeOnFail: true
      }
    );
  };

  queueService.start(QueueName.ProjectV3Migration, async (job) => {
    const { projectId } = job.data;
    const { botKey, shouldUseSecretV2Bridge: isProjectUpgradedToV3 } = await projectBotService.getBotKey(projectId);
    if (isProjectUpgradedToV3) {
      return;
    }
    if (!botKey) throw new BadRequestError({ message: "Bot not found" });
    await projectDAL.updateById(projectId, { upgradeStatus: ProjectUpgradeStatus.InProgress });
    const { encryptor: secretManagerEncryptor } = await kmsService.createCipherPairWithDataKey({
      projectId,
      type: KmsDataKey.SecretManager
    });

    const folders = await folderDAL.findByProjectId(projectId);
    // except secret version and snapshot migrate rest of everything first in a transaction
    await secretDAL.transaction(async (tx) => {
      for (const folder of folders) {
        const folderId = folder.id;
        /*
         * Secrets Migration
         * */
        // eslint-disable-next-line no-await-in-loop
        const projectV1Secrets = await secretDAL.find({ folderId }, { tx });
        if (projectV1Secrets.length) {
          const secretReferences: {
            secretId: string;
            references: { environment: string; secretPath: string; secretKey: string }[];
          }[] = [];
          await secretV2BridgeDAL.insertMany(
            projectV1Secrets.map((el) => {
              const key = decryptSymmetric128BitHexKeyUTF8({
                ciphertext: el.secretKeyCiphertext,
                iv: el.secretKeyIV,
                tag: el.secretKeyTag,
                key: botKey
              });
              const value = decryptSymmetric128BitHexKeyUTF8({
                ciphertext: el.secretValueCiphertext,
                iv: el.secretValueIV,
                tag: el.secretValueTag,
                key: botKey
              });
              const comment =
                el.secretCommentCiphertext && el.secretCommentTag && el.secretCommentIV
                  ? decryptSymmetric128BitHexKeyUTF8({
                      ciphertext: el.secretCommentCiphertext,
                      iv: el.secretCommentIV,
                      tag: el.secretCommentTag,
                      key: botKey
                    })
                  : "";
              const encryptedValue = secretManagerEncryptor({ plainText: Buffer.from(value) }).cipherTextBlob;
              // create references
              const references = getAllNestedSecretReferences(value);
              secretReferences.push({ secretId: el.id, references });

              const encryptedComment = comment
                ? secretManagerEncryptor({ plainText: Buffer.from(comment) }).cipherTextBlob
                : null;
              return {
                id: el.id,
                createdAt: el.createdAt,
                updatedAt: el.updatedAt,
                skipMultilineEncoding: el.skipMultilineEncoding,
                encryptedComment,
                encryptedValue,
                key,
                version: el.version,
                type: el.type,
                userId: el.userId,
                folderId: el.folderId,
                metadata: el.metadata,
                reminderNote: el.secretReminderNote,
                reminderRepeatDays: el.secretReminderRepeatDays
              };
            }),
            tx
          );
          await secretV2BridgeDAL.upsertSecretReferences(secretReferences);
        }
      }
      /*
       * Secret Tag Migration
       * */
      // eslint-disable-next-line no-await-in-loop
      const projectV1SecretTags = await secretTagDAL.findSecretTagsByProjectId(projectId, tx);
      if (projectV1SecretTags.length) {
        await secretTagDAL.saveTagsToSecretV2(
          projectV1SecretTags.map((el) => ({
            secrets_v2Id: el.secretsId,
            secret_tagsId: el.secret_tagsId
          })),
          tx
        );
      }

      /*
       * Integration Auth Migration
       * Saving the new encrypted colum
       * */
      // eslint-disable-next-line no-await-in-loop
      const projectV1IntegrationAuths = await integrationAuthDAL.find({ projectId }, { tx });
      await integrationAuthDAL.upsert(
        projectV1IntegrationAuths.map((el) => {
          const accessToken =
            el.accessIV && el.accessTag && el.accessCiphertext
              ? decryptSymmetric128BitHexKeyUTF8({
                  ciphertext: el.accessCiphertext,
                  iv: el.accessIV,
                  tag: el.accessTag,
                  key: botKey
                })
              : undefined;
          const accessId =
            el.accessIdIV && el.accessIdTag && el.accessIdCiphertext
              ? decryptSymmetric128BitHexKeyUTF8({
                  ciphertext: el.accessIdCiphertext,
                  iv: el.accessIdIV,
                  tag: el.accessIdTag,
                  key: botKey
                })
              : undefined;
          const refreshToken =
            el.refreshIV && el.refreshTag && el.refreshCiphertext
              ? decryptSymmetric128BitHexKeyUTF8({
                  ciphertext: el.refreshCiphertext,
                  iv: el.refreshIV,
                  tag: el.refreshTag,
                  key: botKey
                })
              : undefined;
          const awsAssumeRoleArn =
            el.awsAssumeIamRoleArnCipherText && el.awsAssumeIamRoleArnIV && el.awsAssumeIamRoleArnTag
              ? decryptSymmetric128BitHexKeyUTF8({
                  ciphertext: el.awsAssumeIamRoleArnCipherText,
                  iv: el.awsAssumeIamRoleArnIV,
                  tag: el.awsAssumeIamRoleArnTag,
                  key: botKey
                })
              : undefined;

          const encryptedAccess = accessToken
            ? secretManagerEncryptor({ plainText: Buffer.from(accessToken) }).cipherTextBlob
            : null;
          const encryptedAccessId = accessId
            ? secretManagerEncryptor({ plainText: Buffer.from(accessId) }).cipherTextBlob
            : null;
          const encryptedRefresh = refreshToken
            ? secretManagerEncryptor({ plainText: Buffer.from(refreshToken) }).cipherTextBlob
            : null;
          const encryptedAwsAssumeIamRoleArn = awsAssumeRoleArn
            ? secretManagerEncryptor({ plainText: Buffer.from(awsAssumeRoleArn) }).cipherTextBlob
            : null;
          return {
            ...el,
            encryptedAccess,
            encryptedRefresh,
            encryptedAccessId,
            encryptedAwsAssumeIamRoleArn
          };
        }),
        "id",
        tx
      );
      /*
       * Secret Rotation Secret Migration
       * Saving the new encrypted colum
       * */

      const projectV1SecretRotations = await secretRotationDAL.find({ projectId }, tx);
      await secretRotationDAL.secretOutputV2InsertMany(
        projectV1SecretRotations.flatMap((el) =>
          el.outputs.map((output) => ({ rotationId: el.id, key: output.key, secretId: output.secret.id }))
        ),
        tx
      );
      await projectDAL.updateById(projectId, { upgradeStatus: null, version: ProjectVersion.V3 }, tx);
    });
  });

  // eslint-disable-next-line
  queueService.listen(QueueName.ProjectV3Migration, "failed", async (job, err) => {
    if (job?.data) {
      const { projectId } = job.data;
      await projectDAL.updateById(projectId, { upgradeStatus: ProjectUpgradeStatus.Failed });
      logger.error(err, `Failed to migrate project to v3: ${projectId}`);
    }
  });

  queueService.listen(QueueName.IntegrationSync, "failed", (job, err) => {
    logger.error(err, "Failed to sync integration %s", job?.id);
  });

  queueService.start(QueueName.SecretWebhook, async (job) => {
    await fnTriggerWebhook({ ...job.data, projectEnvDAL, webhookDAL, projectDAL });
  });

  return {
    // depth is internal only field thus no need to make it available outside
    syncSecrets,
    startSecretV2Migration,
    syncIntegrations,
    addSecretReminder,
    removeSecretReminder,
    handleSecretReminder,
    replicateSecrets
  };
};
