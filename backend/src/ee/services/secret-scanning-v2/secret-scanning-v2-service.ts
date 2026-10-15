import { ForbiddenError } from "@casl/ability";
import { join } from "path";

import { ActionProjectType } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionSecretScanningConfigActions,
  ProjectPermissionSecretScanningDataSourceActions,
  ProjectPermissionSecretScanningFindingActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import {
  createTempFolder,
  deleteTempFolder,
  scanContentAndGetFindings,
  writeTextToFile
} from "@app/ee/services/secret-scanning/secret-scanning-queue/secret-scanning-fns";
import { githubSecretScanningService } from "@app/ee/services/secret-scanning-v2/github/github-secret-scanning-service";
import { GitLabDataSourceScope } from "@app/ee/services/secret-scanning-v2/gitlab/gitlab-secret-scanning-enums";
import {
  SecretScanningDataSource,
  SecretScanningFindingStatus
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { SECRET_SCANNING_FACTORY_MAP } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-factory";
import {
  doesDataSourceSupportDiscovery,
  isDataSourceWebhookRequired,
  listSecretScanningDataSourceOptions
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-fns";
import {
  AUTO_SYNC_DESCRIPTION_HELPER,
  SECRET_SCANNING_DATA_SOURCE_CONNECTION_MAP,
  SECRET_SCANNING_DATA_SOURCE_NAME_MAP
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-maps";
import {
  TAddAllSecretScanningResourcesDTO,
  TAddSecretScanningResourceDTO,
  TCreateSecretScanningDataSourceDTO,
  TDeleteSecretScanningDataSourceDTO,
  TFindSecretScanningDataSourceByIdDTO,
  TFindSecretScanningDataSourceByNameDTO,
  TListSecretScanningDataSourcesByProjectId,
  TRemoveSecretScanningResourceDTO,
  TSecretScanningDataSource,
  TSecretScanningDataSourceCredentials,
  TSecretScanningDataSourceInput,
  TSecretScanningDataSourceWithConnection,
  TSecretScanningDataSourceWithDetails,
  TSecretScanningFinding,
  TSecretScanningResourceWithDetails,
  TSecretScanningScanWithDetails,
  TTriggerSecretScanningDataSourceDTO,
  TUpdateSecretScanningDataSourceDTO,
  TUpdateSecretScanningFindingDTO,
  TUpsertSecretScanningConfigDTO
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-types";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, ConflictError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { TAppConnection } from "@app/services/app-connection/app-connection-types";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { bitbucketSecretScanningService } from "./bitbucket/bitbucket-secret-scanning-service";
import { gitlabSecretScanningService } from "./gitlab/gitlab-secret-scanning-service";
import { TListSecretScanningFindingsFilter, TSecretScanningV2DALFactory } from "./secret-scanning-v2-dal";
import { TSecretScanningV2QueueServiceFactory } from "./secret-scanning-v2-queue";

export type TSecretScanningV2ServiceFactoryDep = {
  secretScanningV2DAL: TSecretScanningV2DALFactory;
  appConnectionService: Pick<TAppConnectionServiceFactory, "validateAppConnectionUsageById">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  secretScanningV2Queue: Pick<
    TSecretScanningV2QueueServiceFactory,
    "queueDataSourceFullScan" | "queueResourceDiffScan" | "handleResourcePushEvent"
  >;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  keyStore: Pick<TKeyStoreFactory, "acquireLock">;
};

export type TSecretScanningV2ServiceFactory = ReturnType<typeof secretScanningV2ServiceFactory>;

const DATA_SOURCE_LOCK_TTL_MS = 60 * 1000;

export const secretScanningV2ServiceFactory = ({
  secretScanningV2DAL,
  permissionService,
  appConnectionService,
  licenseService,
  secretScanningV2Queue,
  appConnectionDAL,
  kmsService,
  keyStore
}: TSecretScanningV2ServiceFactoryDep) => {
  // A data source's webhook lives both with the provider and in its stored credentials, so changes that can touch it
  // run one at a time; two at once would each act on the same credentials and undo each other's webhook.
  const $withDataSourceLock = async <T>(dataSourceId: string, fn: () => Promise<T>): Promise<T> => {
    let lock: Awaited<ReturnType<typeof keyStore.acquireLock>>;
    try {
      lock = await keyStore.acquireLock(
        [KeyStorePrefixes.SecretScanningDataSourceLock(dataSourceId)],
        DATA_SOURCE_LOCK_TTL_MS
      );
    } catch {
      throw new ConflictError({
        message: "This data source is being changed by another request. Wait a moment and try again."
      });
    }

    try {
      return await fn();
    } finally {
      // A slow provider can outlive the TTL, and releasing an expired lock throws.
      try {
        await lock.release();
      } catch (error) {
        logger.warn(error, `secretScanningV2Service: Failed to release data source lock [dataSourceId=${dataSourceId}]`);
      }
    }
  };

  const $checkListSecretScanningDataSourcesByProjectIdPermissions = async (
    projectId: string,
    actor: OrgServiceActor
  ) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.secretScanning)
      throw new BadRequestError({
        message:
          "Failed to access Secret Scanning Data Sources due to plan restriction. Upgrade plan to enable Secret Scanning."
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretScanning,
      projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretScanningDataSourceActions.Read,
      ProjectPermissionSub.SecretScanningDataSources
    );
  };

  const listSecretScanningDataSourcesByProjectId = async (
    { projectId, type }: TListSecretScanningDataSourcesByProjectId,
    actor: OrgServiceActor
  ) => {
    await $checkListSecretScanningDataSourcesByProjectIdPermissions(projectId, actor);

    const dataSources = await secretScanningV2DAL.dataSources.find({
      ...(type && { type }),
      projectId
    });

    return dataSources as TSecretScanningDataSource[];
  };

  const listSecretScanningDataSourcesWithDetailsByProjectId = async (
    { projectId, type }: TListSecretScanningDataSourcesByProjectId,
    actor: OrgServiceActor
  ) => {
    await $checkListSecretScanningDataSourcesByProjectIdPermissions(projectId, actor);

    const dataSources = await secretScanningV2DAL.dataSources.findWithDetails({
      ...(type && { type }),
      projectId
    });

    return dataSources as TSecretScanningDataSourceWithDetails[];
  };

  const findSecretScanningDataSourceById = async (
    { type, dataSourceId }: TFindSecretScanningDataSourceByIdDTO,
    actor: OrgServiceActor
  ) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.secretScanning)
      throw new BadRequestError({
        message:
          "Failed to access Secret Scanning Data Source due to plan restriction. Upgrade plan to enable Secret Scanning."
      });

    const dataSource = await secretScanningV2DAL.dataSources.findById(dataSourceId);

    if (!dataSource)
      throw new NotFoundError({
        message: `Could not find ${SECRET_SCANNING_DATA_SOURCE_NAME_MAP[type]} Data Source with ID "${dataSourceId}"`
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretScanning,
      projectId: dataSource.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretScanningDataSourceActions.Read,
      ProjectPermissionSub.SecretScanningDataSources
    );

    if (type !== dataSource.type)
      throw new BadRequestError({
        message: `Secret Scanning Data Source with ID "${dataSourceId}" is not configured for ${SECRET_SCANNING_DATA_SOURCE_NAME_MAP[type]}`
      });

    return dataSource as TSecretScanningDataSource;
  };

  const findSecretScanningDataSourceByName = async (
    { type, sourceName, projectId }: TFindSecretScanningDataSourceByNameDTO,
    actor: OrgServiceActor
  ) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.secretScanning)
      throw new BadRequestError({
        message:
          "Failed to access Secret Scanning Data Source due to plan restriction. Upgrade plan to enable Secret Scanning."
      });

    // we prevent conflicting names within a folder
    const dataSource = await secretScanningV2DAL.dataSources.findOne({
      name: sourceName,
      projectId
    });

    if (!dataSource)
      throw new NotFoundError({
        message: `Could not find ${SECRET_SCANNING_DATA_SOURCE_NAME_MAP[type]} Data Source with name "${sourceName}"`
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretScanning,
      projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretScanningDataSourceActions.Read,
      ProjectPermissionSub.SecretScanningDataSources
    );

    if (type !== dataSource.type)
      throw new BadRequestError({
        message: `Secret Scanning Data Source with ID "${dataSource.id}" is not configured for ${SECRET_SCANNING_DATA_SOURCE_NAME_MAP[type]}`
      });

    return dataSource as TSecretScanningDataSource;
  };

  // Providers that hook each resource (GitLab account scope) keep their webhooks in line with the data source's
  // resources. Returns undefined when nothing changes.
  const prepareResourceWebhooks = async (
    dataSource: TSecretScanningDataSourceWithConnection,
    encryptedCredentials: Buffer | null | undefined,
    resourceNames: string[]
  ) => {
    const factory = SECRET_SCANNING_FACTORY_MAP[dataSource.type]({ appConnectionDAL, kmsService });
    if (!factory.updateWebhook || !isDataSourceWebhookRequired(dataSource)) return undefined;

    const { encryptor, decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: dataSource.projectId
    });

    if (!encryptedCredentials) {
      const credentials = await factory.setupWebhook({ dataSource, resourceNames });
      if (!credentials) return undefined;

      return {
        encryptedCredentials: encryptor({ plainText: Buffer.from(JSON.stringify(credentials)) }).cipherTextBlob,
        finalize: async () => {},
        revert: () => factory.teardown({ dataSource, credentials })
      };
    }

    const update = await factory.updateWebhook({
      dataSource,
      resourceNames,
      credentials: JSON.parse(
        decryptor({ cipherTextBlob: encryptedCredentials }).toString()
      ) as TSecretScanningDataSourceCredentials
    });
    if (!update) return undefined;

    return {
      encryptedCredentials: encryptor({ plainText: Buffer.from(JSON.stringify(update.credentials)) }).cipherTextBlob,
      finalize: update.finalize,
      revert: update.revert
    };
  };

  const createSecretScanningDataSource = async (
    { isAutoScanEnabled, ...dto }: TCreateSecretScanningDataSourceDTO,
    actor: OrgServiceActor
  ) => {
    const supportsDiscovery = doesDataSourceSupportDiscovery(dto);

    if (dto.isDiscoveryEnabled && !supportsDiscovery)
      throw new BadRequestError({
        message: "Discovering new projects requires a GitLab group scope. Select a group or turn off discovery."
      });

    const isScanNewCommitsEnabled = dto.isScanNewCommitsEnabled ?? isAutoScanEnabled ?? true;
    const payload = {
      ...dto,
      isHistoricalScanEnabled: dto.isHistoricalScanEnabled ?? isAutoScanEnabled ?? true,
      isScanNewCommitsEnabled,
      isDiscoveryEnabled: dto.isDiscoveryEnabled ?? supportsDiscovery,
      // Kept in sync for instances still reading the legacy flag during a rolling deploy.
      isAutoScanEnabled: isScanNewCommitsEnabled
    };

    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.secretScanning)
      throw new BadRequestError({
        message:
          "Failed to create Secret Scanning Data Source due to plan restriction. Upgrade plan to enable Secret Scanning."
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretScanning,
      projectId: payload.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretScanningDataSourceActions.Create,
      ProjectPermissionSub.SecretScanningDataSources
    );

    let connection: TAppConnection | null = null;
    if (payload.connectionId) {
      // validates permission to connect and app is valid for data source
      connection = await appConnectionService.validateAppConnectionUsageById(
        SECRET_SCANNING_DATA_SOURCE_CONNECTION_MAP[payload.type],
        { connectionId: payload.connectionId, projectId: payload.projectId },
        actor
      );
    }

    const factory = SECRET_SCANNING_FACTORY_MAP[payload.type]({
      appConnectionDAL,
      kmsService
    });

    try {
      const createdDataSource = await factory.initialize(
        {
          payload: payload as TSecretScanningDataSourceInput,
          connection: connection as TSecretScanningDataSourceWithConnection["connection"],
          secretScanningV2DAL
        },
        async ({ credentials, externalId }) => {
          let encryptedCredentials: Buffer | null = null;

          if (credentials) {
            const { encryptor } = await kmsService.createCipherPairWithDataKey({
              type: KmsDataKey.SecretManager,
              projectId: payload.projectId
            });

            const { cipherTextBlob } = encryptor({
              plainText: Buffer.from(JSON.stringify(credentials))
            });

            encryptedCredentials = cipherTextBlob;
          }

          return secretScanningV2DAL.dataSources.transaction(async (tx) => {
            const dataSource = await secretScanningV2DAL.dataSources.create(
              {
                encryptedCredentials,
                externalId,
                ...payload
              },
              tx
            );

            await factory.postInitialization({
              payload: payload as TSecretScanningDataSourceInput,
              connection: connection as TSecretScanningDataSourceWithConnection["connection"],
              dataSourceId: dataSource.id,
              credentials
            });

            return dataSource;
          });
        }
      );

      return createdDataSource as TSecretScanningDataSource;
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation) {
        throw new BadRequestError({
          message: `A Secret Scanning Data Source with the name "${payload.name}" already exists for the project with ID "${payload.projectId}"`
        });
      }

      throw err;
    }
  };

  const $updateSecretScanningDataSource = async (
    { type, dataSourceId, isAutoScanEnabled, ...dto }: TUpdateSecretScanningDataSourceDTO,
    actor: OrgServiceActor
  ) => {
    const isScanNewCommitsEnabled = dto.isScanNewCommitsEnabled ?? isAutoScanEnabled;
    const payload = {
      ...dto,
      isHistoricalScanEnabled: dto.isHistoricalScanEnabled ?? isAutoScanEnabled,
      isScanNewCommitsEnabled,
      // Kept in sync for instances still reading the legacy flag during a rolling deploy.
      isAutoScanEnabled: isScanNewCommitsEnabled
    };

    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.secretScanning)
      throw new BadRequestError({
        message:
          "Failed to update Secret Scanning Data Source due to plan restriction. Upgrade plan to enable Secret Scanning."
      });

    const dataSource = await secretScanningV2DAL.dataSources.findById(dataSourceId);

    if (!dataSource)
      throw new NotFoundError({
        message: `Could not find ${SECRET_SCANNING_DATA_SOURCE_NAME_MAP[type]} Data Source with ID "${dataSourceId}"`
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretScanning,
      projectId: dataSource.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretScanningDataSourceActions.Edit,
      ProjectPermissionSub.SecretScanningDataSources
    );

    if (type !== dataSource.type)
      throw new BadRequestError({
        message: `Secret Scanning Data Source with ID "${dataSourceId}" is not configured for ${SECRET_SCANNING_DATA_SOURCE_NAME_MAP[type]}`
      });

    let connection: TAppConnection | null = null;
    if (dataSource.connectionId) {
      // validates permission to connect and app is valid for data source
      connection = await appConnectionService.validateAppConnectionUsageById(
        SECRET_SCANNING_DATA_SOURCE_CONNECTION_MAP[dataSource.type],
        { connectionId: dataSource.connectionId, projectId: dataSource.projectId },
        actor
      );
    }

    const factory = SECRET_SCANNING_FACTORY_MAP[dataSource.type]({
      appConnectionDAL,
      kmsService
    });

    if (payload.isDiscoveryEnabled && !doesDataSourceSupportDiscovery(dataSource))
      throw new BadRequestError({
        message: "Discovering new projects requires a GitLab group scope. Select a group or turn off discovery."
      });

    if (payload.config) {
      await factory.validateConfigUpdate({
        dataSource: {
          ...dataSource,
          connection
        } as TSecretScanningDataSourceWithConnection,
        config: payload.config as TSecretScanningDataSourceWithConnection["config"]
      });
    }

    const dataSourceWithConnection = { ...dataSource, connection } as TSecretScanningDataSourceWithConnection;
    // A webhook created here has to see the config this update saves.
    const nextDataSourceWithConnection = (
      payload.config ? { ...dataSourceWithConnection, config: payload.config } : dataSourceWithConnection
    ) as TSecretScanningDataSourceWithConnection;
    const { encryptor, decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: dataSource.projectId
    });

    const isWebhookRequired = isDataSourceWebhookRequired({
      isDiscoveryEnabled: payload.isDiscoveryEnabled ?? dataSource.isDiscoveryEnabled,
      isScanNewCommitsEnabled: payload.isScanNewCommitsEnabled ?? dataSource.isScanNewCommitsEnabled
    });

    // Stored credentials are what tells us a webhook exists, so they are added or cleared alongside it.
    let createdCredentials: TSecretScanningDataSourceCredentials;
    let removedCredentials: TSecretScanningDataSourceCredentials;
    let encryptedCredentials: Buffer | null | undefined;

    if (isWebhookRequired && !dataSource.encryptedCredentials) {
      const resources = await secretScanningV2DAL.resources.find({ dataSourceId });
      createdCredentials = await factory.setupWebhook({
        dataSource: nextDataSourceWithConnection,
        resourceNames: resources.map((resource) => resource.name)
      });

      if (createdCredentials) {
        encryptedCredentials = encryptor({ plainText: Buffer.from(JSON.stringify(createdCredentials)) }).cipherTextBlob;
      }
    } else if (!isWebhookRequired && dataSource.encryptedCredentials) {
      // The webhook is only removed once the update is saved, so a rejected update leaves it working.
      removedCredentials = JSON.parse(
        decryptor({ cipherTextBlob: dataSource.encryptedCredentials }).toString()
      ) as TSecretScanningDataSourceCredentials;
      encryptedCredentials = null;
    }

    let updatedDataSource: TSecretScanningDataSource;

    try {
      updatedDataSource = (await secretScanningV2DAL.dataSources.updateById(dataSourceId, {
        ...payload,
        ...(encryptedCredentials !== undefined && { encryptedCredentials })
      })) as TSecretScanningDataSource;
    } catch (err) {
      if (createdCredentials) {
        await factory.teardown({ dataSource: nextDataSourceWithConnection, credentials: createdCredentials });
      }

      if (err instanceof DatabaseError && (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation) {
        throw new BadRequestError({
          message: `A Secret Scanning Data Source with the name "${payload.name}" already exists for the project with ID "${dataSource.projectId}"`
        });
      }

      throw err;
    }

    if (removedCredentials) {
      try {
        await factory.teardown({ dataSource: dataSourceWithConnection, credentials: removedCredentials });
      } catch (error) {
        // The update is saved and the credentials are cleared, so pushes from a leftover webhook are ignored.
        logger.error(
          error,
          `secretScanningV2Service: Failed to remove webhook after update [dataSourceId=${dataSourceId}] [projectId=${dataSource.projectId}]`
        );
      }
    }

    return updatedDataSource;
  };

  const $deleteSecretScanningDataSource = async (
    { type, dataSourceId }: TDeleteSecretScanningDataSourceDTO,
    actor: OrgServiceActor
  ) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.secretScanning)
      throw new BadRequestError({
        message:
          "Failed to delete Secret Scanning Data Source due to plan restriction. Upgrade plan to enable Secret Scanning."
      });

    const dataSource = await secretScanningV2DAL.dataSources.findById(dataSourceId);

    if (!dataSource)
      throw new NotFoundError({
        message: `Could not find ${SECRET_SCANNING_DATA_SOURCE_NAME_MAP[type]} Data Source with ID "${dataSourceId}"`
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretScanning,
      projectId: dataSource.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretScanningDataSourceActions.Delete,
      ProjectPermissionSub.SecretScanningDataSources
    );

    if (type !== dataSource.type)
      throw new BadRequestError({
        message: `Secret Scanning Data Source with ID "${dataSourceId}" is not configured for ${SECRET_SCANNING_DATA_SOURCE_NAME_MAP[type]}`
      });

    const factory = SECRET_SCANNING_FACTORY_MAP[type]({
      appConnectionDAL,
      kmsService
    });

    let connection: TAppConnection | null = null;
    if (dataSource.connection) {
      connection = await decryptAppConnection(dataSource.connection, kmsService);
    }

    let credentials: TSecretScanningDataSourceCredentials | undefined;

    if (dataSource.encryptedCredentials) {
      const { decryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId: dataSource.projectId
      });

      credentials = JSON.parse(
        decryptor({
          cipherTextBlob: dataSource.encryptedCredentials
        }).toString()
      ) as TSecretScanningDataSourceCredentials;
    }

    await factory.teardown({
      dataSource: {
        ...dataSource,
        // @ts-expect-error currently we don't have a null connection data source
        connection
      },
      credentials
    });

    await secretScanningV2DAL.dataSources.deleteById(dataSourceId);

    return dataSource as TSecretScanningDataSource;
  };

  const triggerSecretScanningDataSourceScan = async (
    { type, dataSourceId, resourceId }: TTriggerSecretScanningDataSourceDTO,
    actor: OrgServiceActor
  ) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.secretScanning)
      throw new BadRequestError({
        message:
          "Failed to trigger scan for Secret Scanning Data Source due to plan restriction. Upgrade plan to enable Secret Scanning."
      });

    const dataSource = await secretScanningV2DAL.dataSources.findById(dataSourceId);

    if (!dataSource)
      throw new NotFoundError({
        message: `Could not find ${SECRET_SCANNING_DATA_SOURCE_NAME_MAP[type]} Data Source with ID "${dataSourceId}"`
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretScanning,
      projectId: dataSource.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretScanningDataSourceActions.TriggerScans,
      ProjectPermissionSub.SecretScanningDataSources
    );

    if (type !== dataSource.type)
      throw new BadRequestError({
        message: `Secret Scanning Data Source with ID "${dataSourceId}" is not configured for ${SECRET_SCANNING_DATA_SOURCE_NAME_MAP[type]}`
      });

    let connection: TAppConnection | null = null;
    if (dataSource.connection) connection = await decryptAppConnection(dataSource.connection, kmsService);

    let resourceExternalId: string | undefined;

    if (resourceId) {
      const resource = await secretScanningV2DAL.resources.findOne({ id: resourceId, dataSourceId });
      if (!resource) {
        throw new NotFoundError({
          message: `Could not find Secret Scanning Resource with ID "${resourceId}" for Data Source with ID "${dataSourceId}"`
        });
      }
      resourceExternalId = resource.externalId;
    }

    await secretScanningV2Queue.queueDataSourceFullScan(
      {
        ...dataSource,
        connection
      } as TSecretScanningDataSourceWithConnection,
      {
        resourceExternalId,
        triggeredByUserId: actor.type === ActorType.USER ? actor.id : undefined
      }
    );

    return dataSource as TSecretScanningDataSource;
  };

  // Adds one resource by name, or every resource the connection can access when no name is given.
  const $addSecretScanningResources = async (
    { type, dataSourceId, resourceName }: TAddAllSecretScanningResourcesDTO & { resourceName?: string },
    actor: OrgServiceActor
  ) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.secretScanning)
      throw new BadRequestError({
        message:
          "Failed to add Secret Scanning Resources due to plan restriction. Upgrade plan to enable Secret Scanning."
      });

    const dataSource = await secretScanningV2DAL.dataSources.findById(dataSourceId);
    const sourceName = SECRET_SCANNING_DATA_SOURCE_NAME_MAP[type];

    if (!dataSource)
      throw new NotFoundError({
        message: `Could not find ${sourceName} Data Source with ID "${dataSourceId}"`
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretScanning,
      projectId: dataSource.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretScanningDataSourceActions.Edit,
      ProjectPermissionSub.SecretScanningDataSources
    );

    if (type !== dataSource.type)
      throw new BadRequestError({
        message: `Secret Scanning Data Source with ID "${dataSourceId}" is not configured for ${sourceName}`
      });

    if (dataSource.isDisconnected)
      throw new BadRequestError({
        message: `Data Source "${dataSource.name}" is disconnected from ${sourceName}, so resources can't be added to it. Delete it and connect ${sourceName} again.`
      });

    if (
      dataSource.type === SecretScanningDataSource.GitLab &&
      (dataSource.config as { scope?: string }).scope === GitLabDataSourceScope.Project
    )
      throw new BadRequestError({
        message: `Data Source "${dataSource.name}" scans a single GitLab project, so projects can't be added to it.`
      });

    // GitLab has no account-level webhook, so adding everything would mean a webhook on every project the
    // connection can access.
    if (
      resourceName === undefined &&
      dataSource.type === SecretScanningDataSource.GitLab &&
      (dataSource.config as { scope?: string }).scope === GitLabDataSourceScope.Account
    )
      throw new BadRequestError({
        message: `Data Source "${dataSource.name}" isn't scoped to a GitLab group, so projects have to be added one at a time.`
      });

    let connection: TAppConnection | null = null;
    if (dataSource.connectionId) {
      connection = await appConnectionService.validateAppConnectionUsageById(
        SECRET_SCANNING_DATA_SOURCE_CONNECTION_MAP[dataSource.type],
        { connectionId: dataSource.connectionId, projectId: dataSource.projectId },
        actor
      );
    }

    const dataSourceWithConnection = { ...dataSource, connection } as TSecretScanningDataSourceWithConnection;
    const factory = SECRET_SCANNING_FACTORY_MAP[dataSource.type]({ appConnectionDAL, kmsService });
    const { noun } = AUTO_SYNC_DESCRIPTION_HELPER[dataSource.type];

    let availableResources: Awaited<ReturnType<typeof factory.listRawResources>>;
    try {
      availableResources = await factory.listRawResources(dataSourceWithConnection);
    } catch (error) {
      if (error instanceof BadRequestError) throw error;

      logger.error(
        error,
        `secretScanningV2Service: Failed to list resources to add [dataSourceId=${dataSourceId}] [projectId=${dataSource.projectId}]`
      );
      throw new BadRequestError({
        message: `Could not list ${noun} from ${sourceName} for Data Source "${dataSource.name}". Check that its App Connection still has access, then try again.`
      });
    }

    let requestedResources = availableResources;

    if (resourceName !== undefined) {
      const resource = availableResources.find((available) => available.name === resourceName);

      if (!resource)
        throw new BadRequestError({
          message: `The App Connection for Data Source "${dataSource.name}" can't access "${resourceName}". Check the name, or give the connection access in ${sourceName}.`
        });

      requestedResources = [resource];
    }

    const existingResources = await secretScanningV2DAL.resources.find({ dataSourceId });
    const existingExternalIds = new Set(existingResources.map((resource) => resource.externalId));
    const newResources = requestedResources.filter((resource) => !existingExternalIds.has(resource.externalId));

    if (!newResources.length)
      return { resources: [], projectId: dataSource.projectId, dataSourceName: dataSource.name };

    const webhook = await prepareResourceWebhooks(dataSourceWithConnection, dataSource.encryptedCredentials, [
      ...existingResources.map((resource) => resource.name),
      ...newResources.map((resource) => resource.name)
    ]);

    let addedResources: Awaited<ReturnType<typeof secretScanningV2DAL.resources.upsert>>;
    try {
      addedResources = await secretScanningV2DAL.resources.transaction(async (tx) => {
        if (webhook) {
          await secretScanningV2DAL.dataSources.updateById(
            dataSourceId,
            { encryptedCredentials: webhook.encryptedCredentials },
            tx
          );
        }

        return secretScanningV2DAL.resources.upsert(
          newResources.map((resource) => ({ ...resource, dataSourceId })),
          ["externalId", "dataSourceId"],
          tx
        );
      });
    } catch (err) {
      await webhook?.revert();
      throw err;
    }

    await webhook?.finalize();

    if (dataSource.isHistoricalScanEnabled) {
      const newExternalIds = new Set(newResources.map((resource) => resource.externalId));

      try {
        await secretScanningV2Queue.queueDataSourceFullScan(dataSourceWithConnection, {
          triggeredByUserId: actor.type === ActorType.USER ? actor.id : undefined,
          shouldScanResource: (resource) => newExternalIds.has(resource.externalId)
        });
      } catch (error) {
        // Deliberately non-fatal: the resources are added, and can be scanned from the data source.
        logger.error(
          error,
          `secretScanningV2Service: Failed to queue historical scan of added resources [dataSourceId=${dataSourceId}] [projectId=${dataSource.projectId}]`
        );
      }
    }

    return { resources: addedResources, projectId: dataSource.projectId, dataSourceName: dataSource.name };
  };

  const addSecretScanningResource = ({ resourceName, ...dto }: TAddSecretScanningResourceDTO, actor: OrgServiceActor) =>
    $withDataSourceLock(dto.dataSourceId, () => $addSecretScanningResources({ ...dto, resourceName }, actor));

  const addAllSecretScanningResources = (dto: TAddAllSecretScanningResourcesDTO, actor: OrgServiceActor) =>
    $withDataSourceLock(dto.dataSourceId, () => $addSecretScanningResources(dto, actor));

  // Not gated on the plan: a downgraded org must still be able to remove what it added.
  const $removeSecretScanningResource = async (
    { type, dataSourceId, resourceId }: TRemoveSecretScanningResourceDTO,
    actor: OrgServiceActor
  ) => {
    const dataSource = await secretScanningV2DAL.dataSources.findById(dataSourceId);
    const sourceName = SECRET_SCANNING_DATA_SOURCE_NAME_MAP[type];

    if (!dataSource)
      throw new NotFoundError({
        message: `Could not find ${sourceName} Data Source with ID "${dataSourceId}"`
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretScanning,
      projectId: dataSource.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretScanningDataSourceActions.Edit,
      ProjectPermissionSub.SecretScanningDataSources
    );

    if (type !== dataSource.type)
      throw new BadRequestError({
        message: `Secret Scanning Data Source with ID "${dataSourceId}" is not configured for ${sourceName}`
      });

    const resource = await secretScanningV2DAL.resources.findOne({ id: resourceId, dataSourceId });

    if (!resource)
      throw new NotFoundError({
        message: `Could not find Secret Scanning Resource with ID "${resourceId}" for Data Source with ID "${dataSourceId}"`
      });

    // A disconnected data source can't reach the provider, so its hook is left behind rather than blocking removal.
    let webhook: Awaited<ReturnType<typeof prepareResourceWebhooks>>;
    if (dataSource.connection && !dataSource.isDisconnected) {
      const connection = await decryptAppConnection(dataSource.connection, kmsService);
      const remainingResources = await secretScanningV2DAL.resources.find({ dataSourceId });

      webhook = await prepareResourceWebhooks(
        { ...dataSource, connection } as TSecretScanningDataSourceWithConnection,
        dataSource.encryptedCredentials,
        remainingResources.filter((remaining) => remaining.id !== resourceId).map((remaining) => remaining.name)
      );
    }

    try {
      await secretScanningV2DAL.resources.transaction(async (tx) => {
        if (webhook) {
          await secretScanningV2DAL.dataSources.updateById(
            dataSourceId,
            { encryptedCredentials: webhook.encryptedCredentials },
            tx
          );
        }

        // Cascades to the resource's scans and findings.
        await secretScanningV2DAL.resources.deleteById(resourceId, tx);
      });
    } catch (err) {
      await webhook?.revert();
      throw err;
    }

    await webhook?.finalize();

    return { resource, projectId: dataSource.projectId, dataSourceName: dataSource.name };
  };

  const listSecretScanningResourcesByDataSourceId = async (
    { type, dataSourceId }: TFindSecretScanningDataSourceByIdDTO,
    actor: OrgServiceActor
  ) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.secretScanning)
      throw new BadRequestError({
        message:
          "Failed to access Secret Scanning Resources due to plan restriction. Upgrade plan to enable Secret Scanning."
      });

    const dataSource = await secretScanningV2DAL.dataSources.findById(dataSourceId);

    if (!dataSource)
      throw new NotFoundError({
        message: `Could not find ${SECRET_SCANNING_DATA_SOURCE_NAME_MAP[type]} Data Source with ID "${dataSourceId}"`
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretScanning,
      projectId: dataSource.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretScanningDataSourceActions.ReadResources,
      ProjectPermissionSub.SecretScanningDataSources
    );

    if (type !== dataSource.type)
      throw new BadRequestError({
        message: `Secret Scanning Data Source with ID "${dataSourceId}" is not configured for ${SECRET_SCANNING_DATA_SOURCE_NAME_MAP[type]}`
      });

    const resources = await secretScanningV2DAL.resources.find({
      dataSourceId
    });

    return { resources, projectId: dataSource.projectId };
  };

  // Lists what the data source's connection can see, so a user can pick resources to add to its include list.
  const listSecretScanningAvailableResourcesByDataSourceId = async (
    { type, dataSourceId }: TFindSecretScanningDataSourceByIdDTO,
    actor: OrgServiceActor
  ) => {
    const dataSource = await secretScanningV2DAL.dataSources.findById(dataSourceId);

    if (!dataSource)
      throw new NotFoundError({
        message: `Could not find ${SECRET_SCANNING_DATA_SOURCE_NAME_MAP[type]} Data Source with ID "${dataSourceId}"`
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretScanning,
      projectId: dataSource.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretScanningDataSourceActions.ReadResources,
      ProjectPermissionSub.SecretScanningDataSources
    );

    if (type !== dataSource.type)
      throw new BadRequestError({
        message: `Secret Scanning Data Source with ID "${dataSourceId}" is not configured for ${SECRET_SCANNING_DATA_SOURCE_NAME_MAP[type]}`
      });

    const sourceName = SECRET_SCANNING_DATA_SOURCE_NAME_MAP[type];

    if (dataSource.isDisconnected)
      throw new BadRequestError({
        message: `Data Source "${dataSource.name}" is disconnected from ${sourceName}, so its resources can't be listed. Delete it and connect ${sourceName} again.`
      });

    let connection: TAppConnection | null = null;
    if (dataSource.connection) connection = await decryptAppConnection(dataSource.connection, kmsService);

    const factory = SECRET_SCANNING_FACTORY_MAP[dataSource.type]({
      appConnectionDAL,
      kmsService
    });

    let rawResources: Awaited<ReturnType<typeof factory.listRawResources>>;
    try {
      rawResources = await factory.listRawResources({
        ...dataSource,
        connection
      } as TSecretScanningDataSourceWithConnection);
    } catch (error) {
      if (error instanceof BadRequestError) throw error;

      logger.error(
        error,
        `secretScanningV2Service: Failed to list available resources [dataSourceId=${dataSourceId}] [projectId=${dataSource.projectId}]`
      );
      throw new BadRequestError({
        message: `Could not list resources from ${sourceName} for Data Source "${dataSource.name}". Check that its App Connection still has access, then try again.`
      });
    }

    const existingResources = await secretScanningV2DAL.resources.find({ dataSourceId });
    const existingExternalIds = new Set(existingResources.map((resource) => resource.externalId));

    const resources = rawResources
      .map((resource) => ({
        ...resource,
        isIncluded: existingExternalIds.has(resource.externalId)
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { resources, projectId: dataSource.projectId };
  };

  const listSecretScanningScansByDataSourceId = async (
    { type, dataSourceId }: TFindSecretScanningDataSourceByIdDTO,
    actor: OrgServiceActor
  ) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.secretScanning)
      throw new BadRequestError({
        message:
          "Failed to access Secret Scanning Resources due to plan restriction. Upgrade plan to enable Secret Scanning."
      });

    const dataSource = await secretScanningV2DAL.dataSources.findById(dataSourceId);

    if (!dataSource)
      throw new NotFoundError({
        message: `Could not find ${SECRET_SCANNING_DATA_SOURCE_NAME_MAP[type]} Data Source with ID "${dataSourceId}"`
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretScanning,
      projectId: dataSource.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretScanningDataSourceActions.ReadScans,
      ProjectPermissionSub.SecretScanningDataSources
    );

    if (type !== dataSource.type)
      throw new BadRequestError({
        message: `Secret Scanning Data Source with ID "${dataSourceId}" is not configured for ${SECRET_SCANNING_DATA_SOURCE_NAME_MAP[type]}`
      });

    const scans = await secretScanningV2DAL.scans.findByDataSourceId(dataSourceId);

    return { scans, projectId: dataSource.projectId };
  };

  const listSecretScanningResourcesWithDetailsByDataSourceId = async (
    { type, dataSourceId }: TFindSecretScanningDataSourceByIdDTO,
    actor: OrgServiceActor
  ) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.secretScanning)
      throw new BadRequestError({
        message:
          "Failed to access Secret Scanning Resources due to plan restriction. Upgrade plan to enable Secret Scanning."
      });

    const dataSource = await secretScanningV2DAL.dataSources.findById(dataSourceId);

    if (!dataSource)
      throw new NotFoundError({
        message: `Could not find ${SECRET_SCANNING_DATA_SOURCE_NAME_MAP[type]} Data Source with ID "${dataSourceId}"`
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretScanning,
      projectId: dataSource.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretScanningDataSourceActions.ReadResources,
      ProjectPermissionSub.SecretScanningDataSources
    );

    if (type !== dataSource.type)
      throw new BadRequestError({
        message: `Secret Scanning Data Source with ID "${dataSourceId}" is not configured for ${SECRET_SCANNING_DATA_SOURCE_NAME_MAP[type]}`
      });

    const resources = await secretScanningV2DAL.resources.findWithDetails({ dataSourceId });

    return { resources: resources as TSecretScanningResourceWithDetails[], projectId: dataSource.projectId };
  };

  const listSecretScanningScansWithDetailsByDataSourceId = async (
    { type, dataSourceId }: TFindSecretScanningDataSourceByIdDTO,
    actor: OrgServiceActor
  ) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.secretScanning)
      throw new BadRequestError({
        message:
          "Failed to access Secret Scanning Scans due to plan restriction. Upgrade plan to enable Secret Scanning."
      });

    const dataSource = await secretScanningV2DAL.dataSources.findById(dataSourceId);

    if (!dataSource)
      throw new NotFoundError({
        message: `Could not find ${SECRET_SCANNING_DATA_SOURCE_NAME_MAP[type]} Data Source with ID "${dataSourceId}"`
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretScanning,
      projectId: dataSource.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretScanningDataSourceActions.ReadScans,
      ProjectPermissionSub.SecretScanningDataSources
    );

    if (type !== dataSource.type)
      throw new BadRequestError({
        message: `Secret Scanning Data Source with ID "${dataSourceId}" is not configured for ${SECRET_SCANNING_DATA_SOURCE_NAME_MAP[type]}`
      });

    const scans = await secretScanningV2DAL.scans.findWithDetailsByDataSourceId(dataSourceId);

    return { scans: scans as TSecretScanningScanWithDetails[], projectId: dataSource.projectId };
  };

  const getSecretScanningUnresolvedFindingsCountByProjectId = async (projectId: string, actor: OrgServiceActor) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.secretScanning)
      throw new BadRequestError({
        message:
          "Failed to access Secret Scanning Findings due to plan restriction. Upgrade plan to enable Secret Scanning."
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretScanning,
      projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretScanningFindingActions.Read,
      ProjectPermissionSub.SecretScanningFindings
    );

    return secretScanningV2DAL.findings.countByProjectId(projectId, {
      status: SecretScanningFindingStatus.Unresolved
    });
  };

  const listSecretScanningFindingsByProjectId = async (
    projectId: string,
    filter: TListSecretScanningFindingsFilter,
    actor: OrgServiceActor
  ) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.secretScanning)
      throw new BadRequestError({
        message:
          "Failed to access Secret Scanning Findings due to plan restriction. Upgrade plan to enable Secret Scanning."
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretScanning,
      projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretScanningFindingActions.Read,
      ProjectPermissionSub.SecretScanningFindings
    );

    const { findings, totalCount } = await secretScanningV2DAL.findings.findByProjectId(projectId, filter);

    return { findings: findings as TSecretScanningFinding[], totalCount };
  };

  const updateSecretScanningFindingById = async (
    { findingId, triageComment, status }: TUpdateSecretScanningFindingDTO,
    actor: OrgServiceActor
  ) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.secretScanning)
      throw new BadRequestError({
        message:
          "Failed to access Secret Scanning Findings due to plan restriction. Upgrade plan to enable Secret Scanning."
      });

    const finding = await secretScanningV2DAL.findings.findByIdWithDetails(findingId);

    if (!finding)
      throw new NotFoundError({
        message: `Could not find Secret Scanning Finding with ID "${findingId}"`
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretScanning,
      projectId: finding.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretScanningFindingActions.Update,
      ProjectPermissionSub.SecretScanningFindings
    );

    const isStatusChange = status !== undefined && status !== finding.status;
    const now = new Date();

    const updatedFinding = await secretScanningV2DAL.findings.transaction(async (tx) => {
      await secretScanningV2DAL.findings.updateById(
        findingId,
        {
          triageComment,
          status,
          ...(isStatusChange || triageComment !== undefined
            ? { triagedAt: now, triagedByUserId: actor.type === ActorType.USER ? actor.id : null }
            : {}),
          ...(isStatusChange ? { resolvedAt: status === SecretScanningFindingStatus.Resolved ? now : null } : {})
        },
        tx
      );

      // read back in the same transaction: a replica may not have the write yet
      return secretScanningV2DAL.findings.findByIdWithDetails(findingId, tx);
    });

    return { finding: updatedFinding as TSecretScanningFinding, projectId: finding.projectId };
  };

  const findSecretScanningConfigByProjectId = async (projectId: string, actor: OrgServiceActor) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.secretScanning)
      throw new BadRequestError({
        message:
          "Failed to access Secret Scanning Configuration due to plan restriction. Upgrade plan to enable Secret Scanning."
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretScanning,
      projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretScanningConfigActions.Read,
      ProjectPermissionSub.SecretScanningConfigs
    );

    const config = await secretScanningV2DAL.configs.findOne({
      projectId
    });

    return (
      config ?? { content: null, projectId, updatedAt: null } // using default config
    );
  };

  const upsertSecretScanningConfig = async (
    { projectId, content }: TUpsertSecretScanningConfigDTO,
    actor: OrgServiceActor
  ) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.secretScanning)
      throw new BadRequestError({
        message:
          "Failed to access Secret Scanning Configuration due to plan restriction. Upgrade plan to enable Secret Scanning."
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretScanning,
      projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretScanningConfigActions.Update,
      ProjectPermissionSub.SecretScanningConfigs
    );

    if (content) {
      const tempFolder = await createTempFolder();
      try {
        const configPath = join(tempFolder, "infisical-scan.toml");
        await writeTextToFile(configPath, content);

        // just checking if config parses
        await scanContentAndGetFindings("", configPath);
      } catch (e) {
        throw new BadRequestError({
          message: "Unable to parse configuration: Check syntax and formatting."
        });
      } finally {
        await deleteTempFolder(tempFolder);
      }
    }

    const [config] = await secretScanningV2DAL.configs.upsert(
      [
        {
          projectId,
          content
        }
      ],
      "projectId"
    );

    return config;
  };

  const updateSecretScanningDataSource = (dto: TUpdateSecretScanningDataSourceDTO, actor: OrgServiceActor) =>
    $withDataSourceLock(dto.dataSourceId, () => $updateSecretScanningDataSource(dto, actor));

  const deleteSecretScanningDataSource = (dto: TDeleteSecretScanningDataSourceDTO, actor: OrgServiceActor) =>
    $withDataSourceLock(dto.dataSourceId, () => $deleteSecretScanningDataSource(dto, actor));

  const removeSecretScanningResource = (dto: TRemoveSecretScanningResourceDTO, actor: OrgServiceActor) =>
    $withDataSourceLock(dto.dataSourceId, () => $removeSecretScanningResource(dto, actor));

  return {
    listSecretScanningDataSourceOptions,
    listSecretScanningDataSourcesByProjectId,
    listSecretScanningDataSourcesWithDetailsByProjectId,
    findSecretScanningDataSourceById,
    findSecretScanningDataSourceByName,
    createSecretScanningDataSource,
    updateSecretScanningDataSource,
    deleteSecretScanningDataSource,
    triggerSecretScanningDataSourceScan,
    addSecretScanningResource,
    addAllSecretScanningResources,
    removeSecretScanningResource,
    listSecretScanningResourcesByDataSourceId,
    listSecretScanningAvailableResourcesByDataSourceId,
    listSecretScanningScansByDataSourceId,
    listSecretScanningResourcesWithDetailsByDataSourceId,
    listSecretScanningScansWithDetailsByDataSourceId,
    getSecretScanningUnresolvedFindingsCountByProjectId,
    listSecretScanningFindingsByProjectId,
    updateSecretScanningFindingById,
    findSecretScanningConfigByProjectId,
    upsertSecretScanningConfig,
    github: githubSecretScanningService(secretScanningV2DAL, secretScanningV2Queue),
    bitbucket: bitbucketSecretScanningService(secretScanningV2DAL, secretScanningV2Queue, kmsService),
    gitlab: gitlabSecretScanningService(secretScanningV2DAL, secretScanningV2Queue, kmsService)
  };
};
