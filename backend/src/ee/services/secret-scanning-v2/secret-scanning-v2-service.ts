import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-service";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import {
  ProjectPermissionSecretScanningDataSourceActions,
  ProjectPermissionSecretScanningFindingActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { SecretScanningFindingStatus } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
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
  TSecretScanningDataSourceWithConnection,
  TSecretScanningDataSourceWithDetails,
  TSecretScanningResourceWithDetails,
  TSecretScanningScanWithDetails,
  TTriggerSecretScanningDataSourceDTO,
  TUpdateSecretScanningDataSourceDTO
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-types";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { TQueueServiceFactory } from "@app/queue";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { TAppConnection } from "@app/services/app-connection/app-connection-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TSecretScanningV2DALFactory } from "./secret-scanning-v2-dal";
import { TSecretScanningV2QueueServiceFactory } from "./secret-scanning-v2-queue";

export type TSecretScanningV2ServiceFactoryDep = {
  secretScanningV2DAL: TSecretScanningV2DALFactory;
  appConnectionService: Pick<TAppConnectionServiceFactory, "connectAppConnectionById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  keyStore: Pick<TKeyStoreFactory, "acquireLock" | "setItemWithExpiry" | "getItem">;
  queueService: Pick<TQueueServiceFactory, "queuePg">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "update" | "updateById">;
  secretScanningV2Queue: Pick<TSecretScanningV2QueueServiceFactory, "queueDataSourceFullScan">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TSecretScanningV2ServiceFactory = ReturnType<typeof secretScanningV2ServiceFactory>;

export const secretScanningV2ServiceFactory = ({
  secretScanningV2DAL,
  permissionService,
  appConnectionService,
  licenseService,
  auditLogService,
  keyStore,
  queueService,
  appConnectionDAL,
  secretScanningV2Queue,
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
    { projectId, ...payload }: TCreateSecretScanningDataSourceDTO,
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
      projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretScanningDataSourceActions.Create,
      ProjectPermissionSub.SecretScanningDataSources
    );

    if (payload.connectionId) {
      // validates permission to connect and app is valid for data source
      await appConnectionService.connectAppConnectionById(
        SECRET_SCANNING_DATA_SOURCE_CONNECTION_MAP[payload.type],
        payload.connectionId,
        actor
      );
    }

    try {
      // TODO: initialize webhooks

      const dataSource = await secretScanningV2DAL.dataSources.create({
        projectId,
        ...payload
      });

      return dataSource as TSecretScanningDataSource;
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation) {
        throw new BadRequestError({
          message: `A Secret Scanning Data Source with the name "${payload.name}" already exists for the project with ID "${projectId}"`
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

  const deleteSecretScanningResource = async (
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

    // TODO: clean up webhooks
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

    return findings;
  };

  return {
    listSecretScanningDataSourceOptions,
    listSecretScanningDataSourcesByProjectId,
    listSecretScanningDataSourcesWithDetailsByProjectId,
    findSecretScanningDataSourceById,
    findSecretScanningDataSourceByName,
    createSecretScanningDataSource,
    updateSecretScanningDataSource,
    deleteSecretScanningResource,
    triggerSecretScanningDataSourceScan,
    listSecretScanningResourcesByDataSourceId,
    listSecretScanningResourcesWithDetailsByDataSourceId,
    listSecretScanningScansWithDetailsByDataSourceId,
    getSecretScanningUnresolvedFindingsCountByProjectId,
    listSecretScanningFindingsByProjectId
  };
};
