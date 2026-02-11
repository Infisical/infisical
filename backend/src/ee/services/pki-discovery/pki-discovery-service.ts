import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionPkiDiscoveryActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TPkiDiscoveryConfigDALFactory } from "./pki-discovery-config-dal";
import { TPkiDiscoveryScanHistoryDALFactory } from "./pki-discovery-scan-history-dal";
import {
  PkiDiscoveryScanStatus,
  PkiDiscoveryType,
  TCreatePkiDiscoveryDTO,
  TDeletePkiDiscoveryDTO,
  TGetLatestScanDTO,
  TGetPkiDiscoveryDTO,
  TGetScanHistoryDTO,
  TListPkiDiscoveriesDTO,
  TPkiDiscoveryTargetConfig,
  TTriggerPkiDiscoveryScanDTO,
  TUpdatePkiDiscoveryDTO
} from "./pki-discovery-types";

const MAX_DISCOVERIES_PER_PROJECT = 10;
const SCAN_RATE_LIMIT_HOURS = 24;

type TPkiDiscoveryServiceFactoryDep = {
  pkiDiscoveryConfigDAL: Pick<
    TPkiDiscoveryConfigDALFactory,
    | "create"
    | "findById"
    | "updateById"
    | "deleteById"
    | "findByProjectId"
    | "countByProjectId"
    | "findByIdWithCounts"
    | "findByName"
    | "claimScanSlot"
  >;
  pkiDiscoveryScanHistoryDAL: Pick<
    TPkiDiscoveryScanHistoryDALFactory,
    "findLatestByDiscoveryId" | "findByDiscoveryId" | "countByDiscoveryId"
  >;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  queuePkiDiscoveryScan: (discoveryId: string) => Promise<void>;
};

export type TPkiDiscoveryServiceFactory = ReturnType<typeof pkiDiscoveryServiceFactory>;

const validateTargetConfigForType = (discoveryType: PkiDiscoveryType, config: TPkiDiscoveryTargetConfig) => {
  switch (discoveryType) {
    case PkiDiscoveryType.Network:
      if (!config.ipRanges?.length && !config.domains?.length) {
        throw new BadRequestError({
          message: "Target configuration must include at least one IP range or domain"
        });
      }
      break;
    default:
      throw new BadRequestError({ message: `Unsupported discovery type: ${discoveryType as string}` });
  }
};

export const pkiDiscoveryServiceFactory = ({
  pkiDiscoveryConfigDAL,
  pkiDiscoveryScanHistoryDAL,
  projectDAL,
  permissionService,
  queuePkiDiscoveryScan
}: TPkiDiscoveryServiceFactoryDep) => {
  const createDiscovery = async ({
    projectId,
    name,
    description,
    discoveryType = PkiDiscoveryType.Network,
    targetConfig,
    isAutoScanEnabled,
    scanIntervalDays,
    gatewayId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TCreatePkiDiscoveryDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiDiscoveryActions.Create,
      ProjectPermissionSub.PkiDiscovery
    );

    const project = await projectDAL.findById(projectId);
    if (!project) {
      throw new NotFoundError({ message: `Project with ID '${projectId}' not found` });
    }

    const existingCount = await pkiDiscoveryConfigDAL.countByProjectId(projectId);
    if (existingCount >= MAX_DISCOVERIES_PER_PROJECT) {
      throw new BadRequestError({
        message: `Maximum number of discovery configurations (${MAX_DISCOVERIES_PER_PROJECT}) reached for this project`
      });
    }

    const existingByName = await pkiDiscoveryConfigDAL.findByName(projectId, name);
    if (existingByName) {
      throw new BadRequestError({
        message: `A discovery configuration with name '${name}' already exists in this project`
      });
    }

    validateTargetConfigForType(discoveryType, targetConfig);

    const discovery = await pkiDiscoveryConfigDAL.create({
      projectId,
      name,
      description,
      discoveryType,
      targetConfig,
      isAutoScanEnabled: isAutoScanEnabled ?? false,
      scanIntervalDays: isAutoScanEnabled ? scanIntervalDays : null,
      gatewayId,
      isActive: true
    });

    return discovery;
  };

  const updateDiscovery = async ({
    discoveryId,
    name,
    description,
    targetConfig,
    isAutoScanEnabled,
    scanIntervalDays,
    gatewayId,
    isActive,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TUpdatePkiDiscoveryDTO) => {
    const discovery = await pkiDiscoveryConfigDAL.findById(discoveryId);
    if (!discovery) {
      throw new NotFoundError({ message: `Discovery configuration with ID '${discoveryId}' not found` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: discovery.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiDiscoveryActions.Edit,
      ProjectPermissionSub.PkiDiscovery
    );

    if (name && name !== discovery.name) {
      const existingByName = await pkiDiscoveryConfigDAL.findByName(discovery.projectId, name);
      if (existingByName) {
        throw new BadRequestError({
          message: `A discovery configuration with name '${name}' already exists in this project`
        });
      }
    }

    if (targetConfig) {
      validateTargetConfigForType(
        (discovery.discoveryType as PkiDiscoveryType) || PkiDiscoveryType.Network,
        targetConfig
      );
    }

    const updatedDiscovery = await pkiDiscoveryConfigDAL.updateById(discoveryId, {
      name,
      description,
      targetConfig,
      isAutoScanEnabled,
      scanIntervalDays: isAutoScanEnabled ? scanIntervalDays : null,
      gatewayId,
      isActive
    });

    return updatedDiscovery;
  };

  const deleteDiscovery = async ({
    discoveryId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TDeletePkiDiscoveryDTO) => {
    const discovery = await pkiDiscoveryConfigDAL.findById(discoveryId);
    if (!discovery) {
      throw new NotFoundError({ message: `Discovery configuration with ID '${discoveryId}' not found` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: discovery.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiDiscoveryActions.Delete,
      ProjectPermissionSub.PkiDiscovery
    );

    await pkiDiscoveryConfigDAL.deleteById(discoveryId);

    return discovery;
  };

  const getDiscovery = async ({ discoveryId, actor, actorId, actorAuthMethod, actorOrgId }: TGetPkiDiscoveryDTO) => {
    const discovery = await pkiDiscoveryConfigDAL.findByIdWithCounts(discoveryId);
    if (!discovery) {
      throw new NotFoundError({ message: `Discovery configuration with ID '${discoveryId}' not found` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: discovery.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiDiscoveryActions.Read,
      ProjectPermissionSub.PkiDiscovery
    );

    return discovery;
  };

  const listDiscoveries = async ({
    projectId,
    offset,
    limit,
    search,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TListPkiDiscoveriesDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiDiscoveryActions.Read,
      ProjectPermissionSub.PkiDiscovery
    );

    const discoveries = await pkiDiscoveryConfigDAL.findByProjectId(projectId, { offset, limit, search });
    const totalCount = await pkiDiscoveryConfigDAL.countByProjectId(projectId, { search });

    return { discoveries, totalCount };
  };

  const triggerScan = async ({
    discoveryId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TTriggerPkiDiscoveryScanDTO) => {
    const discovery = await pkiDiscoveryConfigDAL.findById(discoveryId);
    if (!discovery) {
      throw new NotFoundError({ message: `Discovery configuration with ID '${discoveryId}' not found` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: discovery.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiDiscoveryActions.RunScan,
      ProjectPermissionSub.PkiDiscovery
    );

    if (!discovery.isActive) {
      throw new BadRequestError({ message: "Cannot trigger scan on an inactive discovery configuration" });
    }

    if (discovery.lastScannedAt) {
      const hoursSinceLastScan = (Date.now() - new Date(discovery.lastScannedAt).getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastScan < SCAN_RATE_LIMIT_HOURS) {
        throw new ForbiddenRequestError({
          message: `Please wait at least ${SCAN_RATE_LIMIT_HOURS} hour(s) between manual scans`
        });
      }
    }

    if (discovery.lastScanStatus === PkiDiscoveryScanStatus.Running) {
      throw new BadRequestError({ message: "A scan is already in progress for this discovery configuration" });
    }

    const claimed = await pkiDiscoveryConfigDAL.claimScanSlot(discoveryId, discovery.projectId);
    if (!claimed) {
      throw new BadRequestError({
        message: "Another scan is already running in this project. Only one concurrent scan per project is allowed."
      });
    }

    await queuePkiDiscoveryScan(discoveryId);

    return { message: "Scan queued successfully", name: discovery.name, projectId: discovery.projectId };
  };

  const getLatestScan = async ({ discoveryId, actor, actorId, actorAuthMethod, actorOrgId }: TGetLatestScanDTO) => {
    const discovery = await pkiDiscoveryConfigDAL.findById(discoveryId);
    if (!discovery) {
      throw new NotFoundError({ message: `Discovery configuration with ID '${discoveryId}' not found` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: discovery.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiDiscoveryActions.Read,
      ProjectPermissionSub.PkiDiscovery
    );

    const latestScan = await pkiDiscoveryScanHistoryDAL.findLatestByDiscoveryId(discoveryId);

    return latestScan || null;
  };

  const getScanHistory = async ({
    discoveryId,
    offset,
    limit,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TGetScanHistoryDTO) => {
    const discovery = await pkiDiscoveryConfigDAL.findById(discoveryId);
    if (!discovery) {
      throw new NotFoundError({ message: `Discovery configuration with ID '${discoveryId}' not found` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: discovery.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiDiscoveryActions.Read,
      ProjectPermissionSub.PkiDiscovery
    );

    const scans = await pkiDiscoveryScanHistoryDAL.findByDiscoveryId(discoveryId, { offset, limit });
    const totalCount = await pkiDiscoveryScanHistoryDAL.countByDiscoveryId(discoveryId);

    return { scans, totalCount };
  };

  return {
    createDiscovery,
    updateDiscovery,
    deleteDiscovery,
    getDiscovery,
    listDiscoveries,
    triggerScan,
    getLatestScan,
    getScanHistory
  };
};
