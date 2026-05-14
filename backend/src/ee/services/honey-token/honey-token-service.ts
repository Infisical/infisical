import { ForbiddenError } from "@casl/ability";

import { ActionProjectType, OrgMembershipRole, SecretType, TableName } from "@app/db/schemas";
import { THoneyTokens } from "@app/db/schemas/honey-tokens";
import {
  ProjectPermissionHoneyTokenActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { getConfig as getAppConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, NotFoundError, UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { OrderByDirection, OrgServiceActor } from "@app/lib/types";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { ActorType } from "@app/services/auth/auth-type";
import { TFolderCommitServiceFactory } from "@app/services/folder-commit/folder-commit-service";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectBotServiceFactory } from "@app/services/project-bot/project-bot-service";
import { TResourceMetadataDALFactory } from "@app/services/resource-metadata/resource-metadata-dal";
import { TSecretQueueFactory } from "@app/services/secret/secret-queue";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TSecretTagDALFactory } from "@app/services/secret-tag/secret-tag-dal";
import { TSecretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";
import { fnSecretBulkDelete, fnSecretBulkInsert } from "@app/services/secret-v2-bridge/secret-v2-bridge-fns";
import { TSecretVersionV2DALFactory } from "@app/services/secret-v2-bridge/secret-version-dal";
import { TSecretVersionV2TagDALFactory } from "@app/services/secret-v2-bridge/secret-version-tag-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TTelemetryServiceFactory } from "@app/services/telemetry/telemetry-service";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { EventType, TAuditLogServiceFactory } from "../audit-log/audit-log-types";
import { THoneyTokenConfigDALFactory } from "../honey-token-config/honey-token-config-dal";
import { HoneyTokenConfigStatus } from "../honey-token-config/honey-token-config-enums";
import { TLicenseServiceFactory } from "../license/license-service";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { TSecretSnapshotServiceFactory } from "../secret-snapshot/secret-snapshot-service";
import { THoneyTokenDALFactory } from "./honey-token-dal";
import { HoneyTokenEventType, HoneyTokenStatus, HoneyTokenType } from "./honey-token-enums";
import { THoneyTokenEventDALFactory } from "./honey-token-event-dal";
import {
  getHoneyTokenProviderDefinition,
  getHoneyTokenServiceHooksByType,
  HONEY_TOKEN_PROVIDER_MAP
} from "./honey-token-provider-fns";
import {
  THoneyTokenByIdInput,
  THoneyTokenCreateInput,
  THoneyTokenListInput,
  THoneyTokenUpdateInput
} from "./honey-token-provider-types";
import {
  AwsHoneyTokenConfigSchema,
  AwsHoneyTokenEventMetadataSchema,
  THoneyTokenEventsInput
} from "./honey-token-types";

const TRIGGER_NOTIFICATION_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

const assertSupportedHoneyTokenType = (type: string): HoneyTokenType => {
  if (Object.hasOwn(HONEY_TOKEN_PROVIDER_MAP, type)) {
    return type as HoneyTokenType;
  }
  throw new BadRequestError({ message: "Unsupported honey token type" });
};

const assertHoneyTokenConnectionType = (type: HoneyTokenType, app: string) => {
  const provider = getHoneyTokenProviderDefinition(type);
  if (app !== provider.connectionApp) {
    throw new BadRequestError({
      message: `Honey Token is not configured for ${provider.name}`
    });
  }
};

export type THoneyTokenServiceFactory = ReturnType<typeof honeyTokenServiceFactory>;
export type THoneyTokenServiceFactoryDep = {
  honeyTokenDAL: THoneyTokenDALFactory;
  honeyTokenConfigDAL: THoneyTokenConfigDALFactory;
  honeyTokenEventDAL: Pick<
    THoneyTokenEventDALFactory,
    "create" | "find" | "countByHoneyTokenId" | "findByHoneyTokenId"
  >;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  appConnectionService: Pick<TAppConnectionServiceFactory, "validateAppConnectionUsageById">;
  orgDAL: Pick<TOrgDALFactory, "findOrgMembersByRole">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  smtpService: Pick<TSmtpService, "sendMail">;
  folderDAL: Pick<
    TSecretFolderDALFactory,
    "findBySecretPath" | "findBySecretPathMultiEnv" | "findSecretPathByFolderIds"
  >;
  projectBotService: Pick<TProjectBotServiceFactory, "getBotKey">;
  secretDAL: Pick<
    TSecretV2BridgeDALFactory,
    "insertMany" | "upsertSecretReferences" | "find" | "deleteMany" | "invalidateSecretCacheByProjectId"
  >;
  secretVersionDAL: Pick<TSecretVersionV2DALFactory, "insertMany" | "findLatestVersionMany">;
  secretVersionTagDAL: Pick<TSecretVersionV2TagDALFactory, "insertMany">;
  secretTagDAL: TSecretTagDALFactory;
  folderCommitService: Pick<TFolderCommitServiceFactory, "createCommit">;
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "insertMany">;
  snapshotService: Pick<TSecretSnapshotServiceFactory, "performSnapshot">;
  secretQueueService: Pick<TSecretQueueFactory, "syncSecrets" | "removeSecretReminder">;
  telemetryService: Pick<TTelemetryServiceFactory, "sendPostHogEvents">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
};

type TSendTriggerNotificationInput = {
  orgId: string;
  honeyToken: THoneyTokens;
  eventMetadata: {
    eventName: string;
    eventTime: string;
    sourceIp?: string | null;
    awsRegion: string;
  };
};

type THandleTriggerInput = {
  type: HoneyTokenType;
  signature: string | undefined;
  payload: unknown;
};

export const honeyTokenServiceFactory = ({
  honeyTokenDAL,
  honeyTokenConfigDAL,
  honeyTokenEventDAL,
  permissionService,
  licenseService,
  kmsService,
  appConnectionDAL,
  appConnectionService,
  orgDAL,
  projectDAL,
  smtpService,
  folderDAL,
  projectBotService,
  secretDAL,
  secretVersionDAL,
  secretVersionTagDAL,
  secretTagDAL,
  folderCommitService,
  resourceMetadataDAL,
  snapshotService,
  secretQueueService,
  telemetryService,
  auditLogService
}: THoneyTokenServiceFactoryDep) => {
  const honeyTokenProviderHooksByType = getHoneyTokenServiceHooksByType({
    honeyTokenDAL,
    honeyTokenConfigDAL,
    honeyTokenEventDAL,
    permissionService,
    licenseService,
    kmsService,
    appConnectionDAL,
    appConnectionService,
    orgDAL,
    projectDAL,
    smtpService,
    folderDAL,
    projectBotService,
    secretDAL,
    secretVersionDAL,
    secretVersionTagDAL,
    secretTagDAL,
    folderCommitService,
    resourceMetadataDAL,
    snapshotService,
    secretQueueService,
    telemetryService,
    auditLogService
  });

  const create = async (
    { projectId, type, name, description, secretsMapping, environment, secretPath }: THoneyTokenCreateInput,
    actor: OrgServiceActor
  ) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionHoneyTokenActions.Create,
      ProjectPermissionSub.HoneyTokens
    );

    const providerType = assertSupportedHoneyTokenType(type);
    const providerHooks = honeyTokenProviderHooksByType[providerType];
    if (!providerHooks) {
      throw new BadRequestError({ message: "Unsupported honey token type" });
    }

    const plan = await licenseService.getPlan(actor.orgId);
    if (!plan.honeyTokens) {
      throw new BadRequestError({
        message: "Failed to create honey token due to plan restriction. Upgrade plan to use honey tokens."
      });
    }

    if (plan.honeyTokenLimit !== null) {
      const honeyTokensCreated = await honeyTokenDAL.countByOrgId(actor.orgId);
      if (honeyTokensCreated >= plan.honeyTokenLimit) {
        throw new BadRequestError({
          message: `Failed to create honey token because your organization has reached its honey token limit (${honeyTokensCreated}/${plan.honeyTokenLimit}).`
        });
      }
    }

    const { shouldUseSecretV2Bridge } = await projectBotService.getBotKey(projectId);

    if (!shouldUseSecretV2Bridge) {
      throw new BadRequestError({
        message: "Project version does not support honey tokens. Please upgrade your project."
      });
    }

    const orgConfig = await honeyTokenConfigDAL.findOne({
      orgId: actor.orgId,
      type: providerType,
      status: HoneyTokenConfigStatus.Complete
    });

    if (!orgConfig?.connectionId) {
      const pendingConfig = await honeyTokenConfigDAL.findOne({
        orgId: actor.orgId,
        type: providerType,
        status: HoneyTokenConfigStatus.VerificationPending
      });

      throw new BadRequestError({
        message: pendingConfig
          ? "Honey token configuration exists but stack verification is still pending. Deploy and verify the stack in Organization Settings before creating honey tokens."
          : "No honey token configuration found for this organization. Configure it in Organization Settings first."
      });
    }

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);

    if (!folder) {
      throw new BadRequestError({
        message: `Could not find folder with path "${secretPath}" in environment "${environment}"`
      });
    }

    const existingHoneyToken = await honeyTokenDAL.findOne({ name, folderId: folder.id });

    if (existingHoneyToken) {
      throw new BadRequestError({
        message: `A honey token with the name "${name}" already exists at the path "${secretPath}" in environment "${environment}"`
      });
    }

    const secretKeys = Object.values(secretsMapping);

    if (new Set(secretKeys).size !== secretKeys.length) {
      throw new BadRequestError({
        message: `Secrets mapping keys must be unique. "${secretKeys.join(", ")}" contains duplicate keys.`
      });
    }

    const conflictingSecrets = await secretDAL.find({
      $in: {
        [`${TableName.SecretV2}.key` as "key"]: secretKeys
      },
      [`${TableName.SecretV2}.folderId` as "folderId"]: folder.id,
      [`${TableName.SecretV2}.type` as "type"]: SecretType.Shared
    });

    if (conflictingSecrets.length) {
      throw new BadRequestError({
        message: `The following secrets already exist at the path "${secretPath}": ${conflictingSecrets
          .map(({ key }) => key)
          .join(", ")}`
      });
    }

    const provider = getHoneyTokenProviderDefinition(providerType);

    const appConnection = await appConnectionService.validateAppConnectionUsageById(
      provider.connectionApp,
      { connectionId: orgConfig.connectionId, projectId },
      actor
    );

    if (appConnection.projectId) {
      throw new BadRequestError({
        message: `Honey token integrations only support organization-level app connections. Please use an organization-level app connection.`
      });
    }
    assertHoneyTokenConnectionType(providerType, appConnection.app);

    const { credentials: honeyTokenCredentials, tokenIdentifier } =
      await providerHooks.createCredentials(appConnection);

    const { encryptor: credentialEncryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    const encryptedCredentials = credentialEncryptor({
      plainText: Buffer.from(JSON.stringify(honeyTokenCredentials))
    }).cipherTextBlob;

    const { encryptor: secretEncryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    const secretEntries = Object.entries(secretsMapping).map(([credentialField, secretKey]) => {
      const credentialValue = honeyTokenCredentials[credentialField];
      if (credentialValue === undefined) {
        throw new BadRequestError({
          message: `Secrets mapping key "${credentialField}" does not exist in generated credentials for this honey token type`
        });
      }

      return { key: secretKey, value: credentialValue };
    });

    const stackDeployment = providerHooks.verifyDeployment
      ? await providerHooks.verifyDeployment({
          appConnection,
          connectionId: orgConfig.connectionId,
          orgId: actor.orgId,
          encryptedConfig: orgConfig.encryptedConfig
        })
      : undefined;

    if (stackDeployment && !stackDeployment.deployed) {
      throw new BadRequestError({
        message: `Honey token deployment verification failed. CloudFormation stack is not deployed${
          stackDeployment.status ? ` (status: ${stackDeployment.status})` : ""
        }.`
      });
    }

    const honeyToken = await honeyTokenDAL.transaction(async (tx) => {
      const createdHoneyToken = await honeyTokenDAL.create(
        {
          name,
          description,
          type: providerType,
          status: HoneyTokenStatus.Active,
          projectId,
          folderId: folder.id,
          encryptedCredentials,
          secretsMapping,
          tokenIdentifier,
          createdByUserId: actor.id
        },
        tx
      );

      const createdSecrets = await fnSecretBulkInsert({
        folderId: folder.id,
        orgId: actor.orgId,
        inputSecrets: secretEntries.map(({ key, value }) => ({
          key,
          type: SecretType.Shared,
          encryptedValue: secretEncryptor({
            plainText: Buffer.from(value)
          }).cipherTextBlob,
          references: []
        })),
        secretDAL,
        secretVersionDAL,
        secretVersionTagDAL,
        secretTagDAL,
        folderCommitService,
        resourceMetadataDAL,
        actor: {
          type: actor.type as ActorType,
          actorId: actor.id
        },
        tx
      });

      await honeyTokenDAL.createSecretMappings(
        createdHoneyToken.id,
        createdSecrets.map((secret) => secret.id),
        tx
      );

      return createdHoneyToken;
    });

    await secretDAL.invalidateSecretCacheByProjectId(projectId);
    await snapshotService.performSnapshot(folder.id);
    await secretQueueService.syncSecrets({
      orgId: actor.orgId,
      secretPath,
      projectId,
      environmentSlug: environment,
      excludeReplication: true
    });

    return {
      honeyToken,
      ...(stackDeployment ? { stackDeployment } : {})
    };
  };

  const updateHoneyToken = async (
    { honeyTokenId, name, description, secretsMapping }: THoneyTokenUpdateInput,
    actor: OrgServiceActor
  ) => {
    const honeyToken = await honeyTokenDAL.findById(honeyTokenId);
    if (!honeyToken) {
      throw new NotFoundError({ message: `Honey token with ID "${honeyTokenId}" not found` });
    }

    const { projectId } = honeyToken;
    const { permission: updatePermission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId
    });
    ForbiddenError.from(updatePermission).throwUnlessCan(
      ProjectPermissionHoneyTokenActions.Edit,
      ProjectPermissionSub.HoneyTokens
    );

    const updatePlan = await licenseService.getPlan(actor.orgId);
    if (!updatePlan.honeyTokens) {
      throw new BadRequestError({
        message: "Failed to update honey token due to plan restriction. Upgrade plan to use honey tokens."
      });
    }

    if (honeyToken.status === HoneyTokenStatus.Revoked) {
      throw new BadRequestError({ message: "Cannot update a revoked honey token" });
    }

    if (name && name !== honeyToken.name) {
      const existingHoneyToken = await honeyTokenDAL.findOne({ name, folderId: honeyToken.folderId });

      if (existingHoneyToken) {
        throw new BadRequestError({
          message: `A honey token with the name "${name}" already exists in this path`
        });
      }
    }

    const oldMapping = honeyToken.secretsMapping as Record<string, string>;
    const hasSecretsMappingChanges =
      secretsMapping !== undefined &&
      (Object.keys(oldMapping).length !== Object.keys(secretsMapping).length ||
        Object.entries(secretsMapping).some(
          ([credentialField, secretKey]) => oldMapping[credentialField] !== secretKey
        ));

    const updatePayload = {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(hasSecretsMappingChanges && { secretsMapping })
    };

    const $updateHoneyTokenWithSecretsMappingChanges = async (nextSecretsMapping: Record<string, string>) => {
      const newSecretKeys = Object.values(nextSecretsMapping);

      if (new Set(newSecretKeys).size !== newSecretKeys.length) {
        throw new BadRequestError({
          message: `Secrets mapping keys must be unique. "${newSecretKeys.join(", ")}" contains duplicate keys.`
        });
      }

      const changedKeys = newSecretKeys.filter((key) => !Object.values(oldMapping).includes(key));

      if (changedKeys.length > 0) {
        const conflictingSecrets = await secretDAL.find({
          $in: {
            [`${TableName.SecretV2}.key` as "key"]: changedKeys
          },
          [`${TableName.SecretV2}.folderId` as "folderId"]: honeyToken.folderId,
          [`${TableName.SecretV2}.type` as "type"]: SecretType.Shared
        });

        if (conflictingSecrets.length) {
          throw new BadRequestError({
            message: `The following secrets already exist: ${conflictingSecrets.map(({ key }) => key).join(", ")}`
          });
        }
      }

      const oldSecretKeys = Object.values(oldMapping);

      const { decryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId
      });

      const decryptedCredentials = JSON.parse(
        decryptor({ cipherTextBlob: honeyToken.encryptedCredentials }).toString()
      ) as Record<string, string>;

      const { encryptor: secretEncryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId
      });

      const secretEntries = Object.entries(nextSecretsMapping).map(([credentialField, secretKey]) => {
        const credentialValue = decryptedCredentials[credentialField];
        if (credentialValue === undefined) {
          throw new BadRequestError({
            message: `Secrets mapping key "${credentialField}" does not exist in stored credentials for this honey token type`
          });
        }

        return { key: secretKey, value: credentialValue };
      });

      return honeyTokenDAL.transaction(async (tx) => {
        await fnSecretBulkDelete({
          folderId: honeyToken.folderId,
          projectId,
          inputSecrets: oldSecretKeys.map((key) => ({ type: SecretType.Shared, secretKey: key })),
          actorId: actor.id,
          secretDAL,
          secretQueueService,
          folderCommitService,
          secretVersionDAL,
          tx
        });

        const createdSecrets = await fnSecretBulkInsert({
          folderId: honeyToken.folderId,
          orgId: actor.orgId,
          inputSecrets: secretEntries.map(({ key, value }) => ({
            key,
            type: SecretType.Shared,
            encryptedValue: secretEncryptor({
              plainText: Buffer.from(value)
            }).cipherTextBlob,
            references: []
          })),
          secretDAL,
          secretVersionDAL,
          secretVersionTagDAL,
          secretTagDAL,
          folderCommitService,
          resourceMetadataDAL,
          actor: {
            type: actor.type as ActorType,
            actorId: actor.id
          },
          tx
        });

        await honeyTokenDAL.createSecretMappings(
          honeyToken.id,
          createdSecrets.map((secret) => secret.id),
          tx
        );

        return honeyTokenDAL.updateById(honeyTokenId, updatePayload, tx);
      });
    };

    const updated =
      hasSecretsMappingChanges && secretsMapping
        ? await $updateHoneyTokenWithSecretsMappingChanges(secretsMapping)
        : await honeyTokenDAL.updateById(honeyTokenId, updatePayload);

    await secretDAL.invalidateSecretCacheByProjectId(projectId);
    await snapshotService.performSnapshot(honeyToken.folderId);

    const [folderInfo] = await folderDAL.findSecretPathByFolderIds(projectId, [honeyToken.folderId]);
    if (folderInfo && hasSecretsMappingChanges) {
      await secretQueueService.syncSecrets({
        orgId: actor.orgId,
        secretPath: folderInfo.path,
        projectId,
        environmentSlug: folderInfo.environmentSlug,
        excludeReplication: true
      });
    }

    return {
      honeyToken: updated,
      folderInfo
    };
  };

  const revokeHoneyToken = async ({ honeyTokenId }: THoneyTokenByIdInput, actor: OrgServiceActor) => {
    const honeyToken = await honeyTokenDAL.findById(honeyTokenId);
    if (!honeyToken) {
      throw new NotFoundError({ message: `Honey token with ID "${honeyTokenId}" not found` });
    }

    const { projectId } = honeyToken;
    const { permission: revokePermission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId
    });
    ForbiddenError.from(revokePermission).throwUnlessCan(
      ProjectPermissionHoneyTokenActions.Revoke,
      ProjectPermissionSub.HoneyTokens
    );

    const revokePlan = await licenseService.getPlan(actor.orgId);
    if (!revokePlan.honeyTokens) {
      throw new BadRequestError({
        message: "Failed to revoke honey token due to plan restriction. Upgrade plan to use honey tokens."
      });
    }

    if (honeyToken.status === HoneyTokenStatus.Revoked) {
      throw new BadRequestError({ message: "Honey token is already revoked" });
    }
    const type = assertSupportedHoneyTokenType(honeyToken.type);

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    const decryptedCredentials = JSON.parse(
      decryptor({ cipherTextBlob: honeyToken.encryptedCredentials }).toString()
    ) as Record<string, string>;

    const orgConfig = await honeyTokenConfigDAL.findOne({
      orgId: actor.orgId,
      type,
      status: HoneyTokenConfigStatus.Complete
    });

    if (!orgConfig?.connectionId) {
      throw new BadRequestError({ message: "Honey token configuration is missing for this organization" });
    }

    const provider = getHoneyTokenProviderDefinition(honeyToken.type);
    const providerHooks = honeyTokenProviderHooksByType[type];

    const appConnection = await appConnectionService.validateAppConnectionUsageById(
      provider.connectionApp,
      { connectionId: orgConfig.connectionId, projectId },
      actor
    );

    if (appConnection.projectId) {
      throw new BadRequestError({
        message: `Honey token integrations only support organization-level app connections. Please use an organization-level app connection.`
      });
    }

    assertHoneyTokenConnectionType(type, appConnection.app);

    if (!providerHooks) throw new BadRequestError({ message: "Unsupported honey token type" });
    await providerHooks.revokeCredentials({
      appConnection,
      credentials: decryptedCredentials
    });

    const secretKeys = Object.values(honeyToken.secretsMapping as Record<string, string>);

    await honeyTokenDAL.transaction(async (tx) => {
      await honeyTokenDAL.deleteSecretMappingsByHoneyTokenId(honeyTokenId, tx);

      await fnSecretBulkDelete({
        folderId: honeyToken.folderId,
        projectId,
        inputSecrets: secretKeys.map((key) => ({ type: SecretType.Shared, secretKey: key })),
        actorId: actor.id,
        secretDAL,
        secretQueueService,
        folderCommitService,
        secretVersionDAL,
        tx
      });

      await honeyTokenDAL.updateById(
        honeyTokenId,
        {
          status: HoneyTokenStatus.Revoked,
          revokedAt: new Date(),
          revokedByUserId: actor.id
        },
        tx
      );
    });

    await secretDAL.invalidateSecretCacheByProjectId(projectId);
    await snapshotService.performSnapshot(honeyToken.folderId);

    const [folderInfo] = await folderDAL.findSecretPathByFolderIds(projectId, [honeyToken.folderId]);
    if (folderInfo) {
      await secretQueueService.syncSecrets({
        orgId: actor.orgId,
        secretPath: folderInfo.path,
        projectId,
        environmentSlug: folderInfo.environmentSlug,
        excludeReplication: true
      });
    }

    return { honeyTokenId, honeyToken, folderInfo };
  };

  const resetHoneyToken = async ({ honeyTokenId }: THoneyTokenByIdInput, actor: OrgServiceActor) => {
    const honeyToken = await honeyTokenDAL.findById(honeyTokenId);
    if (!honeyToken) {
      throw new NotFoundError({ message: `Honey token with ID "${honeyTokenId}" not found` });
    }

    const { permission: resetPermission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId: honeyToken.projectId
    });
    ForbiddenError.from(resetPermission).throwUnlessCan(
      ProjectPermissionHoneyTokenActions.Reset,
      ProjectPermissionSub.HoneyTokens
    );

    assertSupportedHoneyTokenType(honeyToken.type);

    if (honeyToken.status !== HoneyTokenStatus.Triggered) {
      throw new BadRequestError({ message: "Only triggered honey tokens can be reset" });
    }

    const updated = await honeyTokenDAL.updateById(honeyTokenId, {
      status: HoneyTokenStatus.Active,
      lastResetAt: new Date(),
      lastTriggeredAt: null,
      resetByUserId: actor.id
    });

    return { honeyToken: updated };
  };

  const getDashboardHoneyTokenCount = async (
    {
      projectId,
      environments,
      secretPath,
      search
    }: {
      projectId: string;
      environments: string[];
      secretPath: string;
      search?: string;
    },
    actor: OrgServiceActor
  ) => {
    const { permission: readPermission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId
    });

    if (readPermission.cannot(ProjectPermissionHoneyTokenActions.Read, ProjectPermissionSub.HoneyTokens)) {
      return 0;
    }

    const folders = await folderDAL.findBySecretPathMultiEnv(projectId, environments, secretPath);
    if (!folders.length) return 0;

    const folderIds = folders.map((f) => f.id);
    return honeyTokenDAL.countByFolderIds(folderIds, search);
  };

  const getOrgHoneyTokenLimit = async ({ projectId }: { projectId: string }, actor: OrgServiceActor) => {
    const { permission: limitPermission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId
    });
    ForbiddenError.from(limitPermission).throwUnlessCan(
      ProjectPermissionHoneyTokenActions.Read,
      ProjectPermissionSub.HoneyTokens
    );

    const limitPlan = await licenseService.getPlan(actor.orgId);
    if (!limitPlan.honeyTokens) {
      throw new BadRequestError({
        message: "Failed to access honey token limits due to plan restriction. Upgrade plan to use honey tokens."
      });
    }
    const used = await honeyTokenDAL.countByOrgId(actor.orgId);

    return {
      used,
      limit: limitPlan.honeyTokenLimit
    };
  };

  const getDashboardHoneyTokens = async (
    { projectId, environments, secretPath, search, orderBy, orderDirection, limit, offset }: THoneyTokenListInput,
    actor: OrgServiceActor
  ) => {
    const { permission: readPermission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId
    });

    if (readPermission.cannot(ProjectPermissionHoneyTokenActions.Read, ProjectPermissionSub.HoneyTokens)) {
      return [];
    }

    const folders = await folderDAL.findBySecretPathMultiEnv(projectId, environments, secretPath);
    if (!folders.length) return [];

    const folderIds = folders.map((f) => f.id);
    let honeyTokens = await honeyTokenDAL.findByFolderIds(folderIds);

    if (search) {
      honeyTokens = honeyTokens.filter((ht) => ht.name.toLowerCase().includes(search.toLowerCase()));
    }

    if (orderBy === "name") {
      honeyTokens.sort((a, b) => {
        const cmp = a.name.localeCompare(b.name);
        return orderDirection === OrderByDirection.DESC ? -cmp : cmp;
      });
    }

    if (offset !== undefined && limit !== undefined) {
      honeyTokens = honeyTokens.slice(offset, offset + limit);
    }

    return honeyTokens;
  };

  const getCredentials = async ({ honeyTokenId }: THoneyTokenByIdInput, actor: OrgServiceActor) => {
    const honeyToken = await honeyTokenDAL.findById(honeyTokenId);
    if (!honeyToken) {
      throw new NotFoundError({ message: `Honey token with ID "${honeyTokenId}" not found` });
    }

    const { permission: credentialPermission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId: honeyToken.projectId
    });
    ForbiddenError.from(credentialPermission).throwUnlessCan(
      ProjectPermissionHoneyTokenActions.ReadCredentials,
      ProjectPermissionSub.HoneyTokens
    );

    const type = assertSupportedHoneyTokenType(honeyToken.type);
    const providerHooks = honeyTokenProviderHooksByType[type];
    if (!providerHooks) throw new BadRequestError({ message: "Unsupported honey token type" });

    return {
      type,
      credentials: await providerHooks.getCredentialsForDisplay({
        encryptedCredentials: honeyToken.encryptedCredentials,
        projectId: honeyToken.projectId
      })
    };
  };

  const $sendTriggerNotification = async ({ orgId, honeyToken, eventMetadata }: TSendTriggerNotificationInput) => {
    try {
      const [project, orgAdmins] = await Promise.all([
        projectDAL.findById(honeyToken.projectId),
        orgDAL.findOrgMembersByRole(orgId, OrgMembershipRole.Admin)
      ]);
      const adminEmails = orgAdmins.map((admin) => admin.user.email).filter(Boolean) as string[];
      if (adminEmails.length === 0 || !project) return;

      const [folderInfo] = await folderDAL.findSecretPathByFolderIds(project.id, [honeyToken.folderId]);

      const cfg = getAppConfig();
      const siteUrl = cfg.SITE_URL || "https://app.infisical.com";
      const honeyTokenUrlSearch = new URLSearchParams({ honeyTokenId: honeyToken.id });

      if (folderInfo?.path) {
        honeyTokenUrlSearch.set("secretPath", folderInfo.path);
      }

      const honeyTokenUrl = `${siteUrl}/organizations/${orgId}/projects/secret-management/${project.id}/overview?${honeyTokenUrlSearch.toString()}`;

      await smtpService.sendMail({
        recipients: adminEmails,
        subjectLine: `Security Alert: Honey Token "${honeyToken.name}" Triggered`,
        template: SmtpTemplates.HoneyTokenTriggered,
        substitutions: {
          honeyTokenName: honeyToken.name,
          projectName: project.name,
          eventName: eventMetadata.eventName,
          eventTime: eventMetadata.eventTime,
          sourceIp: eventMetadata.sourceIp || "Unknown",
          awsRegion: eventMetadata.awsRegion,
          honeyTokenUrl
        }
      });
    } catch (err) {
      logger.error(
        { err, orgId, honeyTokenId: honeyToken.id },
        `Failed to send honey token trigger notification [orgId=${orgId}] [honeyTokenId=${honeyToken.id}]`
      );
    }
  };

  const handleTrigger = async ({ type, signature, payload }: THandleTriggerInput) => {
    logger.info({ payload, signature, type }, `Honey token trigger received [type=${type}]`);

    const providerType = assertSupportedHoneyTokenType(type);
    if (providerType !== HoneyTokenType.AWS) {
      throw new BadRequestError({ message: "Unsupported honey token type" });
    }

    if (!signature) throw new UnauthorizedError({ message: "Missing X-Infisical-Signature header" });

    const parts = Object.fromEntries(signature.split(",").map((p) => p.split("="))) as Record<string, string>;
    const timestamp = parts.t;
    const signatureHash = parts.v1;
    if (!timestamp || !signatureHash) {
      throw new UnauthorizedError({
        message: "Invalid X-Infisical-Signature format. Expected t=<timestamp>,v1=<signature>"
      });
    }

    const timestampMs = Number(timestamp) * 1000;
    if (Number.isNaN(timestampMs) || Math.abs(Date.now() - timestampMs) > SIGNATURE_TOLERANCE_MS) {
      throw new UnauthorizedError({ message: "Request timestamp is too old or invalid" });
    }

    const rawEvents = Array.isArray(payload) ? (payload as unknown[]) : [payload];
    const firstAccessKeyId = rawEvents
      .map((rawEvent) => {
        const wrapped = rawEvent as { event?: unknown };
        const parsed = AwsHoneyTokenEventMetadataSchema.safeParse(wrapped.event ?? rawEvent);
        return parsed.success ? parsed.data.accessKeyId : null;
      })
      .find((accessKeyId): accessKeyId is string => Boolean(accessKeyId));
    if (!firstAccessKeyId) {
      throw new UnauthorizedError({ message: "Invalid webhook request" });
    }

    const honeyTokenWithOrg = await honeyTokenDAL.findOneByTokenIdentifier(firstAccessKeyId);
    if (!honeyTokenWithOrg) {
      throw new UnauthorizedError({ message: "Invalid webhook request" });
    }

    const config = await honeyTokenConfigDAL.findOne({
      orgId: honeyTokenWithOrg.orgId,
      type: HoneyTokenType.AWS,
      status: HoneyTokenConfigStatus.Complete
    });
    if (!config?.encryptedConfig) {
      throw new UnauthorizedError({ message: "Invalid webhook request" });
    }

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: honeyTokenWithOrg.orgId
    });
    const decrypted = decryptor({ cipherTextBlob: config.encryptedConfig });
    const storedConfig = AwsHoneyTokenConfigSchema.parse(JSON.parse(decrypted.toString()) as unknown);

    const bodyString = JSON.stringify(payload);
    const expectedSignature = crypto.nativeCrypto
      .createHmac("sha256", storedConfig.webhookSigningKey)
      .update(`${timestamp}.${bodyString}`)
      .digest("hex");
    const expectedBuf = Buffer.from(expectedSignature, "hex");
    const receivedBuf = Buffer.from(signatureHash, "hex");
    if (
      expectedBuf.byteLength !== receivedBuf.byteLength ||
      !crypto.nativeCrypto.timingSafeEqual(expectedBuf, receivedBuf)
    ) {
      throw new UnauthorizedError({ message: "Invalid webhook request" });
    }

    /* eslint-disable no-continue */
    for await (const rawEvent of rawEvents) {
      const wrapped = rawEvent as { event?: unknown };
      const parsed = AwsHoneyTokenEventMetadataSchema.safeParse(wrapped.event ?? rawEvent);
      if (!parsed.success) {
        logger.warn(
          { orgId: honeyTokenWithOrg.orgId, event: rawEvent, error: parsed.error },
          `Failed to parse honey token event [orgId=${honeyTokenWithOrg.orgId}]`
        );
        continue;
      }
      const honeyToken = await honeyTokenDAL.findOneByTokenIdentifierAndOrgId(
        parsed.data.accessKeyId,
        honeyTokenWithOrg.orgId
      );
      if (!honeyToken) continue;
      if (honeyToken.status === HoneyTokenStatus.Revoked) continue;

      await honeyTokenEventDAL.create({
        honeyTokenId: honeyToken.id,
        eventType: HoneyTokenEventType.AWS,
        metadata: parsed.data
      });

      const updatedToken = await honeyTokenDAL.tryMarkTriggered(
        parsed.data.accessKeyId,
        TRIGGER_NOTIFICATION_COOLDOWN_MS
      );

      void telemetryService
        .sendPostHogEvents({
          event: PostHogEventTypes.HoneyTokenTriggered,
          distinctId: "anonymous-honey-token-trigger",
          anonymous: true,
          properties: {
            type: honeyToken.type
          }
        })
        .catch(() => {});

      // This block only is executed once per token trigger. So, even if we get 100 events
      // this will run only once.
      if (updatedToken) {
        void $sendTriggerNotification({ orgId: honeyTokenWithOrg.orgId, honeyToken, eventMetadata: parsed.data });

        void auditLogService
          .createAuditLog({
            actor: {
              type: ActorType.UNKNOWN_USER,
              metadata: {}
            },
            orgId: honeyTokenWithOrg.orgId,
            projectId: honeyToken.projectId,
            event: {
              type: EventType.TRIGGER_HONEY_TOKEN,
              metadata: {
                honeyTokenId: honeyToken.id,
                name: honeyToken.name,
                type: honeyToken.type as HoneyTokenType,
                projectId: honeyToken.projectId,
                eventName: parsed.data.eventName,
                eventTime: parsed.data.eventTime,
                sourceIp: parsed.data.sourceIp ?? "Unknown",
                awsRegion: parsed.data.awsRegion
              }
            }
          })
          .catch(() => {});
      }
    }
    /* eslint-enable no-continue */

    return { acknowledged: true };
  };

  const getHoneyTokenById = async ({ honeyTokenId }: THoneyTokenByIdInput, actor: OrgServiceActor) => {
    const honeyToken = await honeyTokenDAL.findById(honeyTokenId);
    if (!honeyToken) {
      throw new NotFoundError({ message: `Honey token with ID "${honeyTokenId}" not found` });
    }

    const { permission: readPermission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId: honeyToken.projectId
    });
    ForbiddenError.from(readPermission).throwUnlessCan(
      ProjectPermissionHoneyTokenActions.Read,
      ProjectPermissionSub.HoneyTokens
    );

    const allInFolder = await honeyTokenDAL.findByFolderIds([honeyToken.folderId]);
    const match = allInFolder.find((ht) => ht.id === honeyTokenId);

    const openEvents = await honeyTokenEventDAL.countByHoneyTokenId(honeyTokenId, honeyToken.lastResetAt ?? undefined);

    return {
      honeyToken: {
        ...honeyToken,
        environment: match?.environment ?? null,
        folder: match?.folder ?? null,
        openEvents
      }
    };
  };

  const getHoneyTokenEvents = async (
    { honeyTokenId, offset, limit }: THoneyTokenEventsInput,
    actor: OrgServiceActor
  ) => {
    const honeyToken = await honeyTokenDAL.findById(honeyTokenId);
    if (!honeyToken) {
      throw new NotFoundError({ message: `Honey token with ID "${honeyTokenId}" not found` });
    }

    const { permission: eventsPermission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId: honeyToken.projectId
    });
    ForbiddenError.from(eventsPermission).throwUnlessCan(
      ProjectPermissionHoneyTokenActions.Read,
      ProjectPermissionSub.HoneyTokens
    );

    const since = honeyToken.lastResetAt ?? undefined;

    const [events, totalCount] = await Promise.all([
      honeyTokenEventDAL.findByHoneyTokenId(honeyTokenId, { since, offset, limit }),
      honeyTokenEventDAL.countByHoneyTokenId(honeyTokenId, since)
    ]);

    return { events, totalCount };
  };

  return {
    create,
    updateHoneyToken,
    revokeHoneyToken,
    resetHoneyToken,
    getCredentials,
    getHoneyTokenById,
    getHoneyTokenEvents,
    getDashboardHoneyTokenCount,
    getOrgHoneyTokenLimit,
    getDashboardHoneyTokens,
    handleTrigger
  };
};
