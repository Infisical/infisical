import { ForbiddenError } from "@casl/ability";
import { join } from "path";

import { ActionProjectType } from "@app/db/schemas/models";
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
import { SecretScanningFindingStatus } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { SECRET_SCANNING_FACTORY_MAP } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-factory";
import { listSecretScanningDataSourceOptions } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-fns";
import {
  SECRET_SCANNING_DATA_SOURCE_CONNECTION_MAP,
  SECRET_SCANNING_DATA_SOURCE_NAME_MAP
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-maps";
import {
  TCreateSecretScanningDataSourceDTO,
  TDeleteSecretScanningDataSourceDTO,
  TFindSecretScanningDataSourceByIdDTO,
  TFindSecretScanningDataSourceByNameDTO,
  TListSecretScanningDataSourcesByProjectId,
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
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { TAppConnection } from "@app/services/app-connection/app-connection-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { bitbucketSecretScanningService } from "./bitbucket/bitbucket-secret-scanning-service";
import { gitlabSecretScanningService } from "./gitlab/gitlab-secret-scanning-service";
import { TSecretScanningV2DALFactory } from "./secret-scanning-v2-dal";
import { TSecretScanningV2QueueServiceFactory } from "./secret-scanning-v2-queue";

export type TSecretScanningV2ServiceFactoryDep = {
  secretScanningV2DAL: TSecretScanningV2DALFactory;
  appConnectionService: Pick<TAppConnectionServiceFactory, "validateAppConnectionUsageById">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  secretScanningV2Queue: Pick<
    TSecretScanningV2QueueServiceFactory,
    "queueDataSourceFullScan" | "queueResourceDiffScan"
  >;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TSecretScanningV2ServiceFactory = ReturnType<typeof secretScanningV2ServiceFactory>;

export const secretScanningV2ServiceFactory = ({
  secretScanningV2DAL,
  permissionService,
  appConnectionService,
  licenseService,
  secretScanningV2Queue,
  appConnectionDAL,
  kmsService
}: TSecretScanningV2ServiceFactoryDep) => {
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

  const createSecretScanningDataSource = async (
    payload: TCreateSecretScanningDataSourceDTO,
    actor: OrgServiceActor
  ) => {
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

      if (payload.isAutoScanEnabled) {
        try {
          await secretScanningV2Queue.queueDataSourceFullScan({
            ...createdDataSource,
            connection
          } as TSecretScanningDataSourceWithConnection);
        } catch {
          // silently fail, don't want to block creation, they'll try scanning when they don't see anything and get the error
        }
      }

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

  const updateSecretScanningDataSource = async (
    { type, dataSourceId, ...payload }: TUpdateSecretScanningDataSourceDTO,
    actor: OrgServiceActor
  ) => {
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

    if (payload.config) {
      await factory.validateConfigUpdate({
        dataSource: {
          ...dataSource,
          connection
        } as TSecretScanningDataSourceWithConnection,
        config: payload.config as TSecretScanningDataSourceWithConnection["config"]
      });
    }

    try {
      const updatedDataSource = await secretScanningV2DAL.dataSources.updateById(dataSourceId, payload);

      return updatedDataSource as TSecretScanningDataSource;
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation) {
        throw new BadRequestError({
          message: `A Secret Scanning Data Source with the name "${payload.name}" already exists for the project with ID "${dataSource.projectId}"`
        });
      }

      throw err;
    }
  };

  const deleteSecretScanningDataSource = async (
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
      resourceExternalId
    );

    return dataSource as TSecretScanningDataSource;
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

    const [finding] = await secretScanningV2DAL.findings.find(
      {
        projectId,
        status: SecretScanningFindingStatus.Unresolved
      },
      { count: true }
    );

    return Number(finding?.count ?? 0);
  };

  const listSecretScanningFindingsByProjectId = async (projectId: string, actor: OrgServiceActor) => {
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

    const findings = await secretScanningV2DAL.findings.find({
      projectId
    });

    return findings as TSecretScanningFinding[];
  };

  const updateSecretScanningFindingById = async (
    { findingId, remarks, status }: TUpdateSecretScanningFindingDTO,
    actor: OrgServiceActor
  ) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.secretScanning)
      throw new BadRequestError({
        message:
          "Failed to access Secret Scanning Findings due to plan restriction. Upgrade plan to enable Secret Scanning."
      });

    const finding = await secretScanningV2DAL.findings.findById(findingId);

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

    const updatedFinding = await secretScanningV2DAL.findings.updateById(findingId, {
      remarks,
      status
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
    listSecretScanningResourcesByDataSourceId,
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
