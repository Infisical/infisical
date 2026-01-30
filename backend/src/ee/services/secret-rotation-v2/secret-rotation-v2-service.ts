import { ForbiddenError, subject } from "@casl/ability";
import { Knex } from "knex";
import isEqual from "lodash.isequal";

import { ActionProjectType, SecretType, TableName } from "@app/db/schemas";
import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { hasSecretReadValueOrDescribePermission } from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionSecretActions,
  ProjectPermissionSecretRotationActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { auth0ClientSecretRotationFactory } from "@app/ee/services/secret-rotation-v2/auth0-client-secret/auth0-client-secret-rotation-fns";
import { azureClientSecretRotationFactory } from "@app/ee/services/secret-rotation-v2/azure-client-secret/azure-client-secret-rotation-fns";
import { databricksServicePrincipalSecretRotationFactory } from "@app/ee/services/secret-rotation-v2/databricks-service-principal-secret/databricks-service-principal-secret-rotation-fns";
import { ldapPasswordRotationFactory } from "@app/ee/services/secret-rotation-v2/ldap-password/ldap-password-rotation-fns";
import { SecretRotation, SecretRotationStatus } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import {
  calculateNextRotationAt,
  decryptSecretRotationCredentials,
  encryptSecretRotationCredentials,
  expandSecretRotation,
  getNextUtcRotationInterval,
  getSecretRotationRotateSecretJobOptions,
  listSecretRotationOptions,
  parseRotationErrorMessage,
  throwOnImmutableParameterUpdate
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-fns";
import {
  SECRET_ROTATION_CONNECTION_MAP,
  SECRET_ROTATION_NAME_MAP
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-maps";
import {
  TCreateSecretRotationV2DTO,
  TDeleteSecretRotationV2DTO,
  TFindSecretRotationV2ByIdDTO,
  TFindSecretRotationV2ByNameDTO,
  TGetDashboardSecretRotationsV2,
  TGetDashboardSecretRotationV2Count,
  TListSecretRotationsV2ByProjectId,
  TQuickSearchSecretRotationsV2,
  TRotateSecretRotationV2,
  TRotationFactory,
  TSecretRotationRotateGeneratedCredentials,
  TSecretRotationV2,
  TSecretRotationV2GeneratedCredentials,
  TSecretRotationV2PermissionContext,
  TSecretRotationV2Raw,
  TSecretRotationV2TemporaryParameters,
  TSecretRotationV2WithConnection,
  TUpdateSecretRotationV2DTO
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { sqlCredentialsRotationFactory } from "@app/ee/services/secret-rotation-v2/shared/sql-credentials";
import { TSecretSnapshotServiceFactory } from "@app/ee/services/secret-snapshot/secret-snapshot-service";
import { KeyStorePrefixes, PgSqlLock, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, InternalServerError, NotFoundError } from "@app/lib/errors";
import { OrderByDirection, OrgServiceActor } from "@app/lib/types";
import { QueueJobs, TQueueServiceFactory } from "@app/queue";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { ActorType } from "@app/services/auth/auth-type";
import { TFolderCommitServiceFactory } from "@app/services/folder-commit/folder-commit-service";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TProjectBotServiceFactory } from "@app/services/project-bot/project-bot-service";
import { TResourceMetadataDALFactory } from "@app/services/resource-metadata/resource-metadata-dal";
import { TSecretQueueFactory } from "@app/services/secret/secret-queue";
import { SecretsOrderBy } from "@app/services/secret/secret-types";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TSecretTagDALFactory } from "@app/services/secret-tag/secret-tag-dal";
import { TSecretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";
import {
  fnSecretBulkDelete,
  fnSecretBulkInsert,
  fnSecretBulkUpdate,
  reshapeBridgeSecret
} from "@app/services/secret-v2-bridge/secret-v2-bridge-fns";
import { TSecretVersionV2DALFactory } from "@app/services/secret-v2-bridge/secret-version-dal";
import { TSecretVersionV2TagDALFactory } from "@app/services/secret-v2-bridge/secret-version-tag-dal";

import { TGatewayV2ServiceFactory } from "../gateway-v2/gateway-v2-service";
import { awsIamUserSecretRotationFactory } from "./aws-iam-user-secret/aws-iam-user-secret-rotation-fns";
import { mongodbCredentialsRotationFactory } from "./mongodb-credentials/mongodb-credentials-rotation-fns";
import { oktaClientSecretRotationFactory } from "./okta-client-secret/okta-client-secret-rotation-fns";
import { openRouterApiKeyRotationFactory } from "./open-router-api-key/open-router-api-key-rotation-fns";
import { redisCredentialsRotationFactory } from "./redis-credentials/redis-credentials-rotation-fns";
import { TSecretRotationV2DALFactory } from "./secret-rotation-v2-dal";
import { unixLinuxLocalAccountRotationFactory } from "./unix-linux-local-account-rotation/unix-linux-local-account-rotation-fns";
import { UnixLinuxLocalAccountRotationMethod } from "./unix-linux-local-account-rotation/unix-linux-local-account-rotation-schemas";
import {
  TUnixLinuxLocalAccountRotation,
  TUnixLinuxLocalAccountRotationGeneratedCredentials
} from "./unix-linux-local-account-rotation/unix-linux-local-account-rotation-types";
import { windowsLocalAccountRotationFactory } from "./windows-local-account-rotation/windows-local-account-rotation-fns";
import { WindowsLocalAccountRotationMethod } from "./windows-local-account-rotation/windows-local-account-rotation-schemas";
import {
  TWindowsLocalAccountRotation,
  TWindowsLocalAccountRotationGeneratedCredentials
} from "./windows-local-account-rotation/windows-local-account-rotation-types";

type TLocalAccountRotation = TUnixLinuxLocalAccountRotation | TWindowsLocalAccountRotation;
type TLocalAccountRotationGeneratedCredentials =
  | TUnixLinuxLocalAccountRotationGeneratedCredentials
  | TWindowsLocalAccountRotationGeneratedCredentials;

export type TSecretRotationV2ServiceFactoryDep = {
  secretRotationV2DAL: TSecretRotationV2DALFactory;
  appConnectionService: Pick<TAppConnectionServiceFactory, "validateAppConnectionUsageById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
  projectBotService: Pick<TProjectBotServiceFactory, "getBotKey">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  keyStore: Pick<TKeyStoreFactory, "acquireLock" | "setItemWithExpiry" | "getItem">;
  folderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath" | "findBySecretPathMultiEnv">;
  secretV2BridgeDAL: Pick<
    TSecretV2BridgeDALFactory,
    "bulkUpdate" | "insertMany" | "deleteMany" | "upsertSecretReferences" | "find" | "invalidateSecretCacheByProjectId"
  >;
  secretVersionV2BridgeDAL: Pick<TSecretVersionV2DALFactory, "insertMany" | "findLatestVersionMany">;
  secretVersionTagV2BridgeDAL: Pick<TSecretVersionV2TagDALFactory, "insertMany">;
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "insertMany" | "delete">;
  secretTagDAL: Pick<TSecretTagDALFactory, "saveTagsToSecretV2" | "deleteTagsToSecretV2" | "find">;
  secretQueueService: Pick<TSecretQueueFactory, "syncSecrets" | "removeSecretReminder">;
  snapshotService: Pick<TSecretSnapshotServiceFactory, "performSnapshot">;
  queueService: Pick<TQueueServiceFactory, "queuePg">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "update" | "updateById">;
  folderCommitService: Pick<TFolderCommitServiceFactory, "createCommit">;
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
};

export type TSecretRotationV2ServiceFactory = ReturnType<typeof secretRotationV2ServiceFactory>;

const MAX_GENERATED_CREDENTIALS_LENGTH = 2;

type TRotationFactoryImplementation = TRotationFactory<
  TSecretRotationV2WithConnection,
  TSecretRotationV2GeneratedCredentials,
  TSecretRotationV2TemporaryParameters
>;
const SECRET_ROTATION_FACTORY_MAP: Record<SecretRotation, TRotationFactoryImplementation> = {
  [SecretRotation.PostgresCredentials]: sqlCredentialsRotationFactory as TRotationFactoryImplementation,
  [SecretRotation.MsSqlCredentials]: sqlCredentialsRotationFactory as TRotationFactoryImplementation,
  [SecretRotation.MySqlCredentials]: sqlCredentialsRotationFactory as TRotationFactoryImplementation,
  [SecretRotation.OracleDBCredentials]: sqlCredentialsRotationFactory as TRotationFactoryImplementation,
  [SecretRotation.Auth0ClientSecret]: auth0ClientSecretRotationFactory as TRotationFactoryImplementation,
  [SecretRotation.AzureClientSecret]: azureClientSecretRotationFactory as TRotationFactoryImplementation,
  [SecretRotation.AwsIamUserSecret]: awsIamUserSecretRotationFactory as TRotationFactoryImplementation,
  [SecretRotation.LdapPassword]: ldapPasswordRotationFactory as TRotationFactoryImplementation,
  [SecretRotation.OktaClientSecret]: oktaClientSecretRotationFactory as TRotationFactoryImplementation,
  [SecretRotation.RedisCredentials]: redisCredentialsRotationFactory as TRotationFactoryImplementation,
  [SecretRotation.MongoDBCredentials]: mongodbCredentialsRotationFactory as TRotationFactoryImplementation,
  [SecretRotation.DatabricksServicePrincipalSecret]:
    databricksServicePrincipalSecretRotationFactory as TRotationFactoryImplementation,
  [SecretRotation.UnixLinuxLocalAccount]: unixLinuxLocalAccountRotationFactory as TRotationFactoryImplementation,
  [SecretRotation.WindowsLocalAccount]: windowsLocalAccountRotationFactory as TRotationFactoryImplementation,
  [SecretRotation.OpenRouterApiKey]: openRouterApiKeyRotationFactory as TRotationFactoryImplementation
};

export const secretRotationV2ServiceFactory = ({
  secretRotationV2DAL,
  folderDAL,
  secretV2BridgeDAL,
  secretVersionV2BridgeDAL,
  secretVersionTagV2BridgeDAL,
  secretTagDAL,
  resourceMetadataDAL,
  permissionService,
  appConnectionService,
  projectBotService,
  licenseService,
  kmsService,
  auditLogService,
  secretQueueService,
  snapshotService,
  keyStore,
  queueService,
  folderCommitService,
  appConnectionDAL,
  gatewayService,
  gatewayV2Service
}: TSecretRotationV2ServiceFactoryDep) => {
  const $queueSendSecretRotationStatusNotification = async (secretRotation: TSecretRotationV2Raw) => {
    const appCfg = getConfig();
    if (!appCfg.isSmtpConfigured) return; // comment out if testing email sending

    await queueService.queuePg(
      QueueJobs.SecretRotationV2SendNotification,
      { secretRotation },
      {
        jobId: `secret-rotation-v2-notification-${secretRotation.id}`,
        retryLimit: 5,
        retryBackoff: true
      }
    );
  };

  const $throwOnConflictingSecrets = async ({
    secretKeys,
    folderId,
    tx,
    secretPath
  }: {
    secretKeys: string[];
    folderId: string;
    tx: Knex;
    secretPath: string;
  }) => {
    if (new Set(secretKeys).size !== secretKeys.length) {
      throw new BadRequestError({
        message: `Secrets mapping keys must be unique. "${secretKeys.join(", ")}" contains duplicate keys.`
      });
    }

    const conflictingSecrets = await secretV2BridgeDAL.find(
      {
        $in: {
          [`${TableName.SecretV2}.key` as "key"]: secretKeys
        },
        [`${TableName.SecretV2}.folderId` as "folderId"]: folderId,
        [`${TableName.SecretV2}.type` as "type"]: SecretType.Shared
      },
      { tx }
    );

    if (conflictingSecrets.length) {
      throw new BadRequestError({
        message: `The following secrets already exist at the path "${secretPath}": ${conflictingSecrets
          .map(({ key }) => key)
          .join(", ")}`
      });
    }
  };

  const listSecretRotationsByProjectId = async (
    { projectId, type }: TListSecretRotationsV2ByProjectId,
    actor: OrgServiceActor
  ) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.secretRotation)
      throw new BadRequestError({
        message: "Failed to access secret rotations due to plan restriction. Upgrade plan to access secret rotations."
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretRotationActions.Read,
      ProjectPermissionSub.SecretRotation
    );

    const secretRotations = await secretRotationV2DAL.find({
      ...(type && { type }),
      projectId
    });

    return Promise.all(
      secretRotations
        .filter((rotation) =>
          permission.can(
            ProjectPermissionSecretRotationActions.Read,
            subject(ProjectPermissionSub.SecretRotation, {
              environment: rotation.environment.slug,
              secretPath: rotation.folder.path,
              connectionId: rotation.connection.id
            })
          )
        )
        .map((rotation) => expandSecretRotation(rotation, kmsService))
    );
  };

  const findSecretRotationById = async ({ type, rotationId }: TFindSecretRotationV2ByIdDTO, actor: OrgServiceActor) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.secretRotation)
      throw new BadRequestError({
        message: "Failed to access secret rotation due to plan restriction. Upgrade plan to access secret rotations."
      });

    const secretRotation = await secretRotationV2DAL.findById(rotationId);

    if (!secretRotation)
      throw new NotFoundError({
        message: `Could not find ${SECRET_ROTATION_NAME_MAP[type]} Rotation with ID "${rotationId}"`
      });

    const { projectId, environment, folder, connection } = secretRotation;

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretRotationActions.Read,
      subject(ProjectPermissionSub.SecretRotation, {
        environment: environment.slug,
        secretPath: folder.path,
        connectionId: connection.id
      })
    );

    if (connection.app !== SECRET_ROTATION_CONNECTION_MAP[type])
      throw new BadRequestError({
        message: `Secret Rotation with ID "${rotationId}" is not configured for ${SECRET_ROTATION_NAME_MAP[type]}`
      });

    return expandSecretRotation(secretRotation, kmsService);
  };

  const findSecretRotationGeneratedCredentialsById = async (
    { type, rotationId }: TFindSecretRotationV2ByIdDTO,
    actor: OrgServiceActor
  ) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.secretRotation)
      throw new BadRequestError({
        message:
          "Failed to access secret rotation credentials due to plan restriction. Upgrade plan to access secret rotations credentials."
      });

    const secretRotation = await secretRotationV2DAL.findById(rotationId);

    if (!secretRotation)
      throw new NotFoundError({
        message: `Could not find ${SECRET_ROTATION_NAME_MAP[type]} Rotation with ID "${rotationId}"`
      });

    const { projectId, environment, folder, connection, encryptedGeneratedCredentials } = secretRotation;

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretRotationActions.ReadGeneratedCredentials,
      subject(ProjectPermissionSub.SecretRotation, {
        environment: environment.slug,
        secretPath: folder.path,
        connectionId: connection.id
      })
    );

    if (connection.app !== SECRET_ROTATION_CONNECTION_MAP[type])
      throw new BadRequestError({
        message: `Secret Rotation with ID "${rotationId}" is not configured for ${SECRET_ROTATION_NAME_MAP[type]}`
      });

    const generatedCredentials = await decryptSecretRotationCredentials({
      projectId,
      encryptedGeneratedCredentials,
      kmsService
    });

    return {
      generatedCredentials,
      secretRotation: secretRotation as TSecretRotationV2
    };
  };

  const findSecretRotationByName = async (
    { type, rotationName, secretPath, environment, projectId }: TFindSecretRotationV2ByNameDTO,
    actor: OrgServiceActor
  ) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.secretRotation)
      throw new BadRequestError({
        message: "Failed to access secret rotation due to plan restriction. Upgrade plan to access secret rotations."
      });

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);

    if (!folder)
      throw new BadRequestError({
        message: `Could not find folder with path "${secretPath}" in environment "${environment}" for project with ID "${projectId}"`
      });

    // we prevent conflicting names within a folder
    const secretRotation = await secretRotationV2DAL.findOne({
      name: rotationName,
      folderId: folder.id
    });

    if (!secretRotation)
      throw new NotFoundError({
        message: `Could not find ${SECRET_ROTATION_NAME_MAP[type]} Rotation with name "${rotationName}"`
      });

    const { connection, id: rotationId } = secretRotation;

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretRotationActions.Read,
      subject(ProjectPermissionSub.SecretRotation, {
        environment,
        secretPath,
        connectionId: connection.id
      })
    );

    if (connection.app !== SECRET_ROTATION_CONNECTION_MAP[type])
      throw new BadRequestError({
        message: `Secret Rotation with ID "${rotationId}" is not configured for ${SECRET_ROTATION_NAME_MAP[type]}`
      });

    return expandSecretRotation(secretRotation, kmsService);
  };

  const createSecretRotation = async (
    {
      projectId,
      secretPath,
      environment,
      rotateAtUtc = { hours: 0, minutes: 0 },
      secretsMapping,
      temporaryParameters,
      ...payload
    }: TCreateSecretRotationV2DTO,
    actor: OrgServiceActor
  ) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.secretRotation)
      throw new BadRequestError({
        message: "Failed to create secret rotation due to plan restriction. Upgrade plan to create secret rotations."
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId
    });

    const { shouldUseSecretV2Bridge } = await projectBotService.getBotKey(projectId);

    if (!shouldUseSecretV2Bridge)
      throw new BadRequestError({
        message:
          "Project version does not support Secret Rotation V2. Please upgrade your project via the Infiscal Dashboard to gain access."
      });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretRotationActions.Create,
      subject(ProjectPermissionSub.SecretRotation, {
        environment,
        secretPath,
        ...(payload.connectionId && { connectionId: payload.connectionId })
      })
    );

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);

    if (!folder)
      throw new BadRequestError({
        message: `Could not find folder with path "${secretPath}" in environment "${environment}" for project with ID "${projectId}"`
      });

    const typeApp = SECRET_ROTATION_CONNECTION_MAP[payload.type];

    // validates permission to connect and app is valid for rotation type
    const connection = await appConnectionService.validateAppConnectionUsageById(
      typeApp,
      { connectionId: payload.connectionId, projectId },
      actor
    );

    const rotationFactory = SECRET_ROTATION_FACTORY_MAP[payload.type](
      {
        parameters: payload.parameters,
        secretsMapping,
        connection,
        rotationInterval: payload.rotationInterval
      } as TSecretRotationV2WithConnection,
      appConnectionDAL,
      kmsService,
      gatewayService,
      gatewayV2Service
    );

    // even though we have a db constraint we want to check before any rotation of credentials is attempted
    // to prevent creation failure after external credentials have been modified
    const conflictingRotation = await secretRotationV2DAL.findOne({
      name: payload.name,
      folderId: folder.id
    });

    if (conflictingRotation)
      throw new BadRequestError({
        message: `A Secret Rotation with the name "${payload.name}" already exists at the secret path "${secretPath}"`
      });

    try {
      const currentTime = new Date();

      // callback structure to support transactional rollback when possible
      const secretRotation = await rotationFactory.issueCredentials(async (newCredentials) => {
        const encryptedGeneratedCredentials = await encryptSecretRotationCredentials({
          generatedCredentials: [newCredentials] as TSecretRotationV2GeneratedCredentials,
          projectId,
          kmsService
        });

        return secretRotationV2DAL.transaction(async (tx) => {
          await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.SecretRotationV2Creation(folder.id)]);

          await $throwOnConflictingSecrets({
            secretPath,
            secretKeys: Object.values(secretsMapping),
            tx,
            folderId: folder.id
          });

          const createdRotation = await secretRotationV2DAL.create(
            {
              folderId: folder.id,
              secretsMapping,
              ...payload,
              encryptedGeneratedCredentials,
              rotateAtUtc,
              rotationStatus: SecretRotationStatus.Success,
              lastRotationAttemptedAt: currentTime,
              lastRotatedAt: currentTime,
              nextRotationAt: calculateNextRotationAt({
                lastRotatedAt: currentTime,
                isAutoRotationEnabled: Boolean(payload.isAutoRotationEnabled),
                rotateAtUtc,
                rotationInterval: payload.rotationInterval,
                rotationStatus: SecretRotationStatus.Success,
                isManualRotation: true
              })
            },
            tx
          );

          const secretsPayload = rotationFactory.getSecretsPayload(newCredentials);

          const { encryptor } = await kmsService.createCipherPairWithDataKey({
            type: KmsDataKey.SecretManager,
            projectId
          });

          const mappedSecrets = await fnSecretBulkInsert({
            folderId: folder.id,
            orgId: connection.orgId,
            tx,
            inputSecrets: secretsPayload.map(({ key, value }) => ({
              key,
              encryptedValue: encryptor({
                plainText: Buffer.from(value)
              }).cipherTextBlob,
              references: []
            })),
            secretDAL: secretV2BridgeDAL,
            secretVersionDAL: secretVersionV2BridgeDAL,
            secretVersionTagDAL: secretVersionTagV2BridgeDAL,
            secretTagDAL,
            folderCommitService,
            resourceMetadataDAL,
            actor: {
              type: actor.type,
              actorId: actor.id
            }
          });

          await secretRotationV2DAL.insertSecretMappings(
            mappedSecrets.map((secret) => ({
              secretId: secret.id,
              rotationId: createdRotation.id
            })),
            tx
          );

          return createdRotation;
        });
      }, temporaryParameters);

      await secretV2BridgeDAL.invalidateSecretCacheByProjectId(projectId);
      await snapshotService.performSnapshot(folder.id);
      await secretQueueService.syncSecrets({
        orgId: connection.orgId,
        secretPath,
        projectId,
        environmentSlug: environment,
        excludeReplication: true
      });

      return await expandSecretRotation(secretRotation, kmsService);
    } catch (err) {
      if (err instanceof DatabaseError) {
        const error = err.error as { code: string; message: string; table: string };

        if (error.code === DatabaseErrorCode.UniqueViolation) {
          switch (error.table) {
            case TableName.SecretRotationV2:
              throw new BadRequestError({
                message: `A Secret Rotation with the name "${payload.name}" already exists at the secret path "${secretPath}"`
              });
            default:
              throw err;
          }
        }

        throw err;
      }

      if (err instanceof BadRequestError) throw err;

      throw new BadRequestError({
        message: parseRotationErrorMessage(err)
      });
    }
  };

  const updateSecretRotation = async (dto: TUpdateSecretRotationV2DTO, actor: OrgServiceActor) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.secretRotation)
      throw new BadRequestError({
        message: "Failed to update secret rotation due to plan restriction. Upgrade plan to update secret rotations."
      });

    const { type, rotationId, ...payload } = dto;

    const secretRotation = await secretRotationV2DAL.findById(rotationId);

    if (!secretRotation)
      throw new NotFoundError({
        message: `Could not find ${SECRET_ROTATION_NAME_MAP[type]} Rotation with ID ${rotationId}`
      });

    throwOnImmutableParameterUpdate(dto, secretRotation);

    const { folder, environment, projectId, folderId, connection } = secretRotation;
    const secretsMapping = secretRotation.secretsMapping as TSecretRotationV2["secretsMapping"];

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretRotationActions.Edit,
      subject(ProjectPermissionSub.SecretRotation, {
        environment: environment.slug,
        secretPath: folder.path,
        connectionId: connection.id
      })
    );

    if (connection.app !== SECRET_ROTATION_CONNECTION_MAP[type])
      throw new BadRequestError({
        message: `Secret Rotation with ID "${rotationId}" is not configured for ${SECRET_ROTATION_NAME_MAP[type]}`
      });

    const nextRotationAt = calculateNextRotationAt({
      ...(secretRotation as TSecretRotationV2),
      ...payload,
      isManualRotation: secretRotation.isLastRotationManual
    });

    let secretsMappingUpdated = false;

    try {
      const updatedSecretRotation = await secretRotationV2DAL.transaction(async (tx) => {
        await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.SecretRotationV2Creation(folder.id)]);

        if (payload.secretsMapping && !isEqual(payload.secretsMapping, secretsMapping)) {
          const currentMappingKeys = Object.values(secretsMapping);
          await $throwOnConflictingSecrets({
            secretPath: folder.path,
            secretKeys: Object.values(payload.secretsMapping).filter((key) => !currentMappingKeys.includes(key)),
            tx,
            folderId: folder.id
          });

          // update mapped secrets names
          await fnSecretBulkUpdate({
            folderId,
            orgId: connection.orgId,
            tx,
            inputSecrets: Object.entries(secretsMapping).map(([mappingKey, secretKey]) => ({
              filter: {
                key: secretKey,
                folderId,
                type: SecretType.Shared
              },
              data: {
                key: payload.secretsMapping![mappingKey as keyof TSecretRotationV2["secretsMapping"]]
              }
            })),
            secretDAL: secretV2BridgeDAL,
            secretVersionDAL: secretVersionV2BridgeDAL,
            secretVersionTagDAL: secretVersionTagV2BridgeDAL,
            secretTagDAL,
            folderCommitService,
            resourceMetadataDAL,
            actor: {
              type: actor.type,
              actorId: actor.id
            }
          });

          secretsMappingUpdated = true;
        }

        return secretRotationV2DAL.updateById(
          rotationId,
          {
            ...payload,
            nextRotationAt
          },
          tx
        );
      });

      if (secretsMappingUpdated) {
        await secretV2BridgeDAL.invalidateSecretCacheByProjectId(projectId);
        await snapshotService.performSnapshot(folder.id);
        await secretQueueService.syncSecrets({
          orgId: connection.orgId,
          secretPath: folder.path,
          projectId,
          environmentSlug: environment.slug,
          excludeReplication: true
        });
      }

      // queue for rotation if adjusted time falls before next cron
      if (nextRotationAt && nextRotationAt.getTime() < getNextUtcRotationInterval().getTime()) {
        await queueService.queuePg(
          QueueJobs.SecretRotationV2RotateSecrets,
          { rotationId, queuedAt: new Date(), isManualRotation: true },
          getSecretRotationRotateSecretJobOptions(updatedSecretRotation)
        );
      }

      return await expandSecretRotation(updatedSecretRotation, kmsService);
    } catch (err) {
      if (err instanceof DatabaseError) {
        const error = err.error as { code: string; message: string; table: string };

        if (error.code === DatabaseErrorCode.UniqueViolation) {
          switch (error.table) {
            case TableName.SecretRotationV2:
              if (payload.name)
                throw new BadRequestError({
                  message: `A Secret Rotation with the name "${payload.name}" already exists at the secret path "${folder.path}"`
                });
              break;
            default:
              throw err;
          }
        }
      }

      if (err instanceof BadRequestError) throw err;

      throw err;
    }
  };

  const deleteSecretRotation = async (
    { type, rotationId, deleteSecrets, revokeGeneratedCredentials }: TDeleteSecretRotationV2DTO,
    actor: OrgServiceActor
  ) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.secretRotation)
      throw new BadRequestError({
        message: "Failed to delete secret rotation due to plan restriction. Upgrade plan to delete secret rotation."
      });

    const secretRotation = await secretRotationV2DAL.findById(rotationId);

    if (!secretRotation)
      throw new NotFoundError({
        message: `Could not find ${SECRET_ROTATION_NAME_MAP[type]} Rotation with ID "${rotationId}"`
      });

    const { folder, environment, projectId, encryptedGeneratedCredentials, connection, folderId, secretsMapping } =
      secretRotation;

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretRotationActions.Delete,
      subject(ProjectPermissionSub.SecretRotation, {
        environment: environment.slug,
        secretPath: folder.path,
        connectionId: connection.id
      })
    );

    if (connection.app !== SECRET_ROTATION_CONNECTION_MAP[type])
      throw new BadRequestError({
        message: `Secret Rotation with ID "${rotationId}" is not configured for ${SECRET_ROTATION_NAME_MAP[type]}`
      });

    const deleteTransaction = async () =>
      secretRotationV2DAL.transaction(async (tx) => {
        if (deleteSecrets) {
          await fnSecretBulkDelete({
            secretDAL: secretV2BridgeDAL,
            secretQueueService,
            inputSecrets: Object.values(secretsMapping as TSecretRotationV2["secretsMapping"]).map((secretKey) => ({
              secretKey,
              type: SecretType.Shared
            })),
            projectId,
            folderId,
            actorId: actor.id, // not actually used since rotated secrets are shared
            actorType: actor.type,
            folderCommitService,
            secretVersionDAL: secretVersionV2BridgeDAL,
            tx
          });
        }

        return secretRotationV2DAL.deleteById(rotationId, tx);
      });

    if (revokeGeneratedCredentials) {
      const appConnection = await decryptAppConnection(connection, kmsService);

      const rotationFactory = SECRET_ROTATION_FACTORY_MAP[type](
        {
          ...secretRotation,
          connection: appConnection
        } as TSecretRotationV2WithConnection,
        appConnectionDAL,
        kmsService,
        gatewayService,
        gatewayV2Service
      );

      const generatedCredentials = await decryptSecretRotationCredentials({
        encryptedGeneratedCredentials,
        projectId,
        kmsService
      });

      await rotationFactory.revokeCredentials(generatedCredentials, deleteTransaction);
    } else {
      await deleteTransaction();
    }

    if (deleteSecrets) {
      await secretV2BridgeDAL.invalidateSecretCacheByProjectId(projectId);
      await snapshotService.performSnapshot(folder.id);
      await secretQueueService.syncSecrets({
        orgId: connection.orgId,
        secretPath: folder.path,
        projectId,
        environmentSlug: environment.slug,
        excludeReplication: true
      });
    }

    return expandSecretRotation(secretRotation, kmsService);
  };

  const rotateGeneratedCredentials = async (
    secretRotation: TSecretRotationV2Raw,
    {
      auditLogInfo,
      jobId,
      shouldSendNotification,
      isFinalAttempt = true,
      isManualRotation = false
    }: TSecretRotationRotateGeneratedCredentials = {}
  ) => {
    const {
      connection,
      folder,
      environment,
      encryptedGeneratedCredentials,
      activeIndex,
      projectId,
      type,
      folderId,
      id: rotationId,
      parameters,
      secretsMapping
    } = secretRotation;

    let lock: Awaited<ReturnType<typeof keyStore.acquireLock>> | undefined;

    try {
      try {
        lock = await keyStore.acquireLock([KeyStorePrefixes.SecretRotationLock(rotationId)], 60 * 1000);
      } catch (e) {
        throw new InternalServerError({
          message: "Failed to acquire rotation lock."
        });
      }

      const appConnection = await decryptAppConnection(connection, kmsService);

      const generatedCredentials = await decryptSecretRotationCredentials({
        projectId,
        encryptedGeneratedCredentials,
        kmsService
      });

      const inactiveIndex = (activeIndex + 1) % MAX_GENERATED_CREDENTIALS_LENGTH;

      const inactiveCredentials = generatedCredentials[inactiveIndex];
      const activeCredentials = generatedCredentials[activeIndex];

      const rotationFactory = SECRET_ROTATION_FACTORY_MAP[type as SecretRotation](
        {
          ...secretRotation,
          connection: appConnection
        } as TSecretRotationV2WithConnection,
        appConnectionDAL,
        kmsService,
        gatewayService,
        gatewayV2Service
      );

      const updatedRotation = await rotationFactory.rotateCredentials(
        inactiveCredentials,
        async (newCredentials) => {
          const updatedCredentials = [...generatedCredentials];
          updatedCredentials[inactiveIndex] = newCredentials;

          const encryptedUpdatedCredentials = await encryptSecretRotationCredentials({
            projectId,
            generatedCredentials: updatedCredentials as TSecretRotationV2GeneratedCredentials,
            kmsService
          });

          return secretRotationV2DAL.transaction(async (tx) => {
            const secretsPayload = rotationFactory.getSecretsPayload(newCredentials);

            const { encryptor } = await kmsService.createCipherPairWithDataKey({
              type: KmsDataKey.SecretManager,
              projectId
            });

            // update mapped secrets with new credential values
            await fnSecretBulkUpdate({
              folderId,
              orgId: connection.orgId,
              tx,
              inputSecrets: secretsPayload.map(({ key, value }) => ({
                filter: {
                  key,
                  folderId,
                  type: SecretType.Shared
                },
                data: {
                  encryptedValue: encryptor({
                    plainText: Buffer.from(value)
                  }).cipherTextBlob,
                  references: []
                }
              })),
              secretDAL: secretV2BridgeDAL,
              secretVersionDAL: secretVersionV2BridgeDAL,
              secretVersionTagDAL: secretVersionTagV2BridgeDAL,
              folderCommitService,
              actor: {
                type: ActorType.PLATFORM
              },
              secretTagDAL,
              resourceMetadataDAL
            });

            const currentTime = new Date();

            return secretRotationV2DAL.updateById(
              secretRotation.id,
              {
                encryptedGeneratedCredentials: encryptedUpdatedCredentials,
                activeIndex: inactiveIndex,
                isLastRotationManual: isManualRotation,
                lastRotatedAt: currentTime,
                lastRotationAttemptedAt: currentTime,
                nextRotationAt: calculateNextRotationAt({
                  ...(secretRotation as TSecretRotationV2),
                  rotationStatus: SecretRotationStatus.Success,
                  lastRotatedAt: currentTime,
                  isManualRotation
                }),
                rotationStatus: SecretRotationStatus.Success,
                lastRotationJobId: jobId,
                encryptedLastRotationMessage: null
              },
              tx
            );
          });
        },
        activeCredentials
      );

      await auditLogService.createAuditLog({
        ...(auditLogInfo ?? {
          actor: {
            type: ActorType.PLATFORM,
            metadata: {}
          }
        }),
        projectId,
        event: {
          type: EventType.SECRET_ROTATION_ROTATE_SECRETS,
          metadata: {
            type,
            rotationId,
            connectionId: connection.id,
            folderId,
            parameters,
            secretsMapping,
            status: SecretRotationStatus.Success,
            occurredAt: new Date(),
            message: null,
            jobId
          }
        }
      });

      await secretV2BridgeDAL.invalidateSecretCacheByProjectId(projectId);
      await snapshotService.performSnapshot(folder.id);
      await secretQueueService.syncSecrets({
        orgId: connection.orgId,
        secretPath: folder.path,
        projectId,
        environmentSlug: environment.slug,
        excludeReplication: true
      });

      return updatedRotation;
    } catch (error) {
      const errorMessage = parseRotationErrorMessage(error);

      if (isFinalAttempt) {
        const { encryptor } = await kmsService.createCipherPairWithDataKey({
          type: KmsDataKey.SecretManager,
          projectId
        });

        const { cipherTextBlob: encryptedMessage } = encryptor({
          plainText: Buffer.from(errorMessage)
        });

        const updatedRotation = await secretRotationV2DAL.updateById(secretRotation.id, {
          rotationStatus: SecretRotationStatus.Failed,
          lastRotationJobId: jobId,
          lastRotationAttemptedAt: new Date(),
          encryptedLastRotationMessage: encryptedMessage,
          nextRotationAt: getNextUtcRotationInterval(secretRotation.rotateAtUtc as TSecretRotationV2["rotateAtUtc"])
        });

        if (shouldSendNotification) {
          await $queueSendSecretRotationStatusNotification(updatedRotation);
        }
      }

      await auditLogService.createAuditLog({
        ...(auditLogInfo ?? {
          actor: {
            type: ActorType.PLATFORM,
            metadata: {}
          }
        }),
        projectId,
        event: {
          type: EventType.SECRET_ROTATION_ROTATE_SECRETS,
          metadata: {
            type,
            rotationId,
            connectionId: connection.id,
            folderId,
            parameters,
            secretsMapping,
            occurredAt: new Date(),
            status: SecretRotationStatus.Failed,
            message: isFinalAttempt ? "See Rotation status for details" : "Rotation will be re-attempted shortly...",
            jobId
          }
        }
      });

      throw new BadRequestError({ message: errorMessage });
    } finally {
      await lock?.release();
    }
  };

  const rotateSecretRotation = async (
    { rotationId, type, auditLogInfo }: TRotateSecretRotationV2,
    actor: OrgServiceActor
  ) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.secretRotation)
      throw new BadRequestError({
        message:
          "Failed to rotate secret rotation secrets due to plan restriction. Upgrade plan to rotate secret rotation secrets."
      });

    const secretRotation = await secretRotationV2DAL.findById(rotationId);

    if (!secretRotation)
      throw new NotFoundError({
        message: `Could not find ${SECRET_ROTATION_NAME_MAP[type]} Rotation with ID "${rotationId}"`
      });

    const { projectId, environment, folder, connection } = secretRotation;

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretRotationActions.RotateSecrets,
      subject(ProjectPermissionSub.SecretRotation, {
        environment: environment.slug,
        secretPath: folder.path,
        connectionId: connection.id
      })
    );

    if (connection.app !== SECRET_ROTATION_CONNECTION_MAP[type])
      throw new BadRequestError({
        message: `Secret Rotation with ID "${rotationId}" is not configured for ${SECRET_ROTATION_NAME_MAP[type]}`
      });

    const isRotationOccurring = Boolean(await keyStore.getItem(KeyStorePrefixes.SecretRotationLock(secretRotation.id)));

    if (isRotationOccurring)
      throw new BadRequestError({ message: `A rotation is already in progress. Please try again shortly.` });

    try {
      const updatedRotation = await rotateGeneratedCredentials(secretRotation, {
        auditLogInfo,
        isManualRotation: true
      });

      return await expandSecretRotation(updatedRotation, kmsService);
    } catch (err) {
      throw new InternalServerError({
        message: (err as Error).message ?? "Failed to rotate secrets: check Rotation status for details."
      });
    }
  };

  const getDashboardSecretRotationCount = async (
    { projectId, environments, secretPath, search }: TGetDashboardSecretRotationV2Count,
    actor: OrgServiceActor
  ) => {
    // we don't check plan for dashboard like dynamic secret, actions will be prevented

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId
    });

    const permissiveEnvironments = environments.filter((environment) =>
      permission.can(
        ProjectPermissionSecretRotationActions.Read,
        subject(ProjectPermissionSub.SecretRotation, { environment, secretPath })
      )
    );

    if (!permissiveEnvironments.length) return 0;

    const folders = await folderDAL.findBySecretPathMultiEnv(projectId, permissiveEnvironments, secretPath);

    if (!folders.length) {
      throw new NotFoundError({
        message: `Folders with path '${secretPath}' in environments with slugs '${permissiveEnvironments.join(
          ", "
        )}' not found`
      });
    }

    const folderIds = folders.map((folder) => folder.id);

    // Fetch rotations (with search) then filter by per-rotation permission so connectionId
    // (and other) restrictions are enforced; findWithMappedSecretsCount cannot filter by connectionId.
    const secretRotations = await secretRotationV2DAL.findWithMappedSecrets(
      { $in: { folderId: folderIds }, search, projectId },
      {}
    );

    const rotationsForCount = secretRotations as TSecretRotationV2PermissionContext[];
    const count = rotationsForCount.filter((rotation) =>
      permission.can(
        ProjectPermissionSecretRotationActions.Read,
        subject(ProjectPermissionSub.SecretRotation, {
          environment: rotation.environment.slug,
          secretPath: rotation.folder.path,
          connectionId: rotation.connection.id
        })
      )
    ).length;

    return count;
  };

  const getDashboardSecretRotations = async (
    {
      projectId,
      environments,
      secretPath,
      search,
      limit,
      offset = 0,
      orderBy = SecretsOrderBy.Name,
      orderDirection = OrderByDirection.ASC
    }: TGetDashboardSecretRotationsV2,
    actor: OrgServiceActor
  ) => {
    // we don't check plan for dashboard like dynamic secret, actions will be prevented

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId
    });

    const permissiveEnvironments = environments.filter((environment) =>
      permission.can(
        ProjectPermissionSecretRotationActions.Read,
        subject(ProjectPermissionSub.SecretRotation, { environment, secretPath })
      )
    );

    if (!permissiveEnvironments.length) return [];

    const folders = await folderDAL.findBySecretPathMultiEnv(projectId, permissiveEnvironments, secretPath);

    if (!folders.length) {
      throw new NotFoundError({
        message: `Folders with path '${secretPath}' in environments with slugs '${permissiveEnvironments.join(
          ", "
        )}' not found`
      });
    }

    const folderIds = folders.map((folder) => folder.id);

    const secretRotationsRaw = await secretRotationV2DAL.findWithMappedSecrets(
      {
        $in: { folderId: folderIds },
        search,
        projectId
      },
      {
        limit,
        offset,
        sort: orderBy ? [[orderBy, orderDirection]] : undefined
      }
    );

    // Filter by per-rotation permission so connectionId (and other) restrictions are enforced.
    const secretRotations = secretRotationsRaw.filter((rotation: TSecretRotationV2PermissionContext) =>
      permission.can(
        ProjectPermissionSecretRotationActions.Read,
        subject(ProjectPermissionSub.SecretRotation, {
          environment: rotation.environment.slug,
          secretPath: rotation.folder.path,
          connectionId: rotation.connection.id
        })
      )
    );

    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    const secretRotationsWithSecrets = await Promise.all(
      secretRotations.map(async ({ secrets, ...rotation }) => {
        const decryptedSecrets = secrets.map((secret) => {
          const canDescribeSecret = hasSecretReadValueOrDescribePermission(
            permission,
            ProjectPermissionSecretActions.DescribeSecret,
            {
              environment: rotation.environment.slug,
              secretPath: rotation.folder.path,
              secretName: secret.key,
              // TODO: scott/akhil our mapper seems to not propagate children's children types
              // @ts-expect-error eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-assignment
              secretTags: (secret.tags as { slug: string; name: string; color: string }[]).map((i) => i.slug)
            }
          );

          if (!canDescribeSecret) {
            return null; // return null so we know to display empty row in dashboard
          }

          const secretValueHidden = !hasSecretReadValueOrDescribePermission(
            permission,
            ProjectPermissionSecretActions.ReadValue,
            {
              environment: rotation.environment.slug,
              secretPath: rotation.folder.path,
              secretName: secret.key,
              // TODO: scott/akhil our mapper seems to not propagate children's children types
              // @ts-expect-error eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-assignment
              secretTags: (secret.tags as { slug: string; name: string; color: string }[]).map((i) => i.slug)
            }
          );
          return reshapeBridgeSecret(
            projectId,
            rotation.environment.slug,
            rotation.folder.path,
            {
              ...secret,
              secretMetadata: (
                secret as { secretMetadata: { key: string; value?: string; encryptedValue?: Buffer }[] }
              ).secretMetadata?.map((el) => ({
                isEncrypted: Boolean(el.encryptedValue),
                key: el.key,
                value: el.encryptedValue
                  ? secretManagerDecryptor({ cipherTextBlob: el.encryptedValue }).toString()
                  : el.value || ""
              })),
              value: secret.encryptedValue
                ? secretManagerDecryptor({ cipherTextBlob: secret.encryptedValue }).toString()
                : "",
              comment: secret.encryptedComment
                ? secretManagerDecryptor({ cipherTextBlob: secret.encryptedComment }).toString()
                : ""
            },
            secretValueHidden && secret.type === SecretType.Shared
          );
        });

        const expandedRotation = await expandSecretRotation(rotation, kmsService);

        return {
          ...expandedRotation,
          secrets: decryptedSecrets
        };
      })
    );

    return secretRotationsWithSecrets as (TSecretRotationV2 & {
      secrets: Awaited<ReturnType<typeof reshapeBridgeSecret>>[];
    })[];
  };

  const getQuickSearchSecretRotations = async (
    { folderMappings, filters: { search, ...options }, projectId }: TQuickSearchSecretRotationsV2,
    actor: OrgServiceActor
  ) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const permissiveFolderMappings = folderMappings.filter(({ path, environment }) =>
      permission.can(
        ProjectPermissionSecretRotationActions.Read,
        subject(ProjectPermissionSub.SecretRotation, { environment, secretPath: path })
      )
    );

    if (!permissiveFolderMappings.length) return [];

    const secretRotations = await secretRotationV2DAL.find(
      {
        projectId,
        $search: {
          name: `%${search}%`
        },
        $in: {
          folderId: permissiveFolderMappings.map(({ folderId }) => folderId)
        }
      },
      options
    );

    // Filter by per-rotation permission so connectionId (and other) restrictions are enforced.
    return secretRotations.filter((rotation) =>
      permission.can(
        ProjectPermissionSecretRotationActions.Read,
        subject(ProjectPermissionSub.SecretRotation, {
          environment: rotation.environment.slug,
          secretPath: rotation.folder.path,
          connectionId: rotation.connection.id
        })
      )
    ) as TSecretRotationV2[];
  };

  const reconcileLocalAccountRotation = async (
    {
      rotationId,
      type
    }: { rotationId: string; type: SecretRotation.UnixLinuxLocalAccount | SecretRotation.WindowsLocalAccount },
    actor: OrgServiceActor
  ) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.secretRotation)
      throw new BadRequestError({
        message:
          "Failed to reconcile secret rotation due to plan restriction. Upgrade plan to reconcile secret rotations."
      });

    const secretRotation = await secretRotationV2DAL.findById(rotationId);

    if (!secretRotation)
      throw new NotFoundError({
        message: `Could not find Secret Rotation with ID "${rotationId}"`
      });

    if (
      secretRotation.type !== SecretRotation.UnixLinuxLocalAccount &&
      secretRotation.type !== SecretRotation.WindowsLocalAccount
    )
      throw new BadRequestError({
        message: `Reconcile operation is only supported for Unix/Linux Local Account and Windows Local Account rotations`
      });

    const { projectId, environment, folder, connection, encryptedGeneratedCredentials, parameters, folderId } =
      secretRotation;

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretRotationActions.RotateSecrets,
      subject(ProjectPermissionSub.SecretRotation, {
        environment: environment.slug,
        secretPath: folder.path,
        connectionId: connection.id
      })
    );

    const localAccountParams = parameters as TLocalAccountRotation["parameters"];

    const loginAsTargetMethod =
      type === SecretRotation.UnixLinuxLocalAccount
        ? UnixLinuxLocalAccountRotationMethod.LoginAsTarget
        : WindowsLocalAccountRotationMethod.LoginAsTarget;

    const loginAsRootMethod =
      type === SecretRotation.UnixLinuxLocalAccount
        ? UnixLinuxLocalAccountRotationMethod.LoginAsRoot
        : WindowsLocalAccountRotationMethod.LoginAsRoot;

    // Only allow reconcile for login-as-target mode
    if (localAccountParams.rotationMethod !== loginAsTargetMethod) {
      throw new BadRequestError({
        message: `Reconcile operation is only supported for login-as-target mode Unix/Linux Local Account and Windows Local Account rotations`
      });
    }

    // Get current generated credentials
    const generatedCredentials = await decryptSecretRotationCredentials({
      projectId,
      encryptedGeneratedCredentials,
      kmsService
    });

    const activeCredentials = generatedCredentials[
      secretRotation.activeIndex
    ] as TLocalAccountRotationGeneratedCredentials[number];
    const appConnection = await decryptAppConnection(connection, kmsService);

    // Use the rotation factory to perform a rotation using the app connection credentials
    const rotationFactory = SECRET_ROTATION_FACTORY_MAP[type](
      {
        ...secretRotation,
        // Override rotation method to login-as-root so it uses the app connection credentials
        parameters: {
          ...localAccountParams,
          rotationMethod: loginAsRootMethod
        },
        connection: appConnection
      } as TSecretRotationV2WithConnection,
      appConnectionDAL,
      kmsService,
      gatewayService,
      gatewayV2Service
    );

    // Issue new credentials using login-as-root mode (app connection credentials)
    const updatedRotation = await rotationFactory.issueCredentials(
      async (newCredentials) => {
        const localAccountCredentials = newCredentials as TLocalAccountRotationGeneratedCredentials[number];
        const updatedCredentials = [...generatedCredentials];
        updatedCredentials[secretRotation.activeIndex] = localAccountCredentials;

        const encryptedUpdatedCredentials = await encryptSecretRotationCredentials({
          projectId,
          generatedCredentials: updatedCredentials as TSecretRotationV2GeneratedCredentials,
          kmsService
        });

        return secretRotationV2DAL.transaction(async (tx) => {
          const { encryptor } = await kmsService.createCipherPairWithDataKey({
            type: KmsDataKey.SecretManager,
            projectId
          });

          // Update the password secret with the new value
          const secretsMapping = secretRotation.secretsMapping as TLocalAccountRotation["secretsMapping"];

          await fnSecretBulkUpdate({
            folderId,
            orgId: connection.orgId,
            tx,
            inputSecrets: [
              {
                filter: {
                  key: secretsMapping.password,
                  folderId,
                  type: SecretType.Shared
                },
                data: {
                  encryptedValue: encryptor({
                    plainText: Buffer.from(localAccountCredentials.password)
                  }).cipherTextBlob,
                  references: []
                }
              }
            ],
            secretDAL: secretV2BridgeDAL,
            secretVersionDAL: secretVersionV2BridgeDAL,
            secretVersionTagDAL: secretVersionTagV2BridgeDAL,
            folderCommitService,
            actor: { type: ActorType.PLATFORM },
            secretTagDAL,
            resourceMetadataDAL
          });

          return secretRotationV2DAL.updateById(
            rotationId,
            {
              encryptedGeneratedCredentials: encryptedUpdatedCredentials,
              lastRotatedAt: new Date(),
              rotationStatus: SecretRotationStatus.Success
            },
            tx
          );
        });
      },
      { password: activeCredentials.password }
    );

    await secretV2BridgeDAL.invalidateSecretCacheByProjectId(projectId);
    await snapshotService.performSnapshot(folder.id);
    await secretQueueService.syncSecrets({
      orgId: connection.orgId,
      secretPath: folder.path,
      projectId,
      environmentSlug: environment.slug,
      excludeReplication: true
    });

    return {
      message: `${type === SecretRotation.UnixLinuxLocalAccount ? "Unix/Linux Local Account" : "Windows Local Account"} rotation credentials reconciled successfully`,
      reconciled: true,
      secretRotation: await expandSecretRotation(updatedRotation, kmsService)
    };
  };

  return {
    listSecretRotationOptions,
    listSecretRotationsByProjectId,
    createSecretRotation,
    updateSecretRotation,
    findSecretRotationById,
    findSecretRotationByName,
    deleteSecretRotation,
    findSecretRotationGeneratedCredentialsById,
    rotateSecretRotation,
    rotateGeneratedCredentials,
    getDashboardSecretRotationCount,
    getDashboardSecretRotations,
    getQuickSearchSecretRotations,
    reconcileLocalAccountRotation
  };
};
