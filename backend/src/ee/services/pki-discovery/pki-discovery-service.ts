import { ForbiddenError } from "@casl/ability";
import pLimit from "p-limit";
import { z } from "zod";

import { ActionProjectType, OrganizationActionScope } from "@app/db/schemas";
import { TGatewayPoolDALFactory } from "@app/ee/services/gateway-pool/gateway-pool-dal";
import { assertIndividualGatewayAllowed } from "@app/ee/services/gateway-pool/gateway-pool-policy-fns";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionGatewayActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionPkiDiscoveryActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, DatabaseError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { TOrgDALFactory } from "@app/services/org/org-dal";

import { TGatewayV2DALFactory } from "../gateway-v2/gateway-v2-dal";
import { TPkiDiscoveryConfigDALFactory } from "./pki-discovery-config-dal";
import { validateTargetConfig } from "./pki-discovery-fns";
import { sshConnectionWithoutGatewayMessage } from "./pki-discovery-host-fns";
import { TPkiDiscoveryScanHistoryDALFactory } from "./pki-discovery-scan-history-dal";
import {
  formatTargetConfigIssue,
  LinuxServerTargetConfigSchema,
  NetworkTargetConfigSchema
} from "./pki-discovery-schemas";
import {
  PkiDiscoveryScanStatus,
  PkiDiscoveryType,
  TCreatePkiDiscoveryDTO,
  TDeletePkiDiscoveryDTO,
  TGetLatestScanDTO,
  TGetPkiDiscoveryDTO,
  TGetScanHistoryDTO,
  TLinuxServerTargetConfig,
  TListPkiDiscoveriesDTO,
  TNetworkTargetConfig,
  TPkiDiscoveryTargetConfig,
  TTriggerPkiDiscoveryScanDTO,
  TUpdatePkiDiscoveryDTO
} from "./pki-discovery-types";

const MAX_CLOUD_DISCOVERIES = 10;
const SCAN_RATE_LIMIT_HOURS = 24;
const CONNECTION_VALIDATION_CONCURRENCY = 5;

type TPkiDiscoveryServiceFactoryDep = {
  pkiDiscoveryConfigDAL: Pick<
    TPkiDiscoveryConfigDALFactory,
    | "create"
    | "findById"
    | "updateById"
    | "deleteById"
    | "findByProjectId"
    | "countByProjectId"
    | "findByIdWithInstallationCounts"
    | "claimScanSlot"
  >;
  pkiDiscoveryScanHistoryDAL: Pick<
    TPkiDiscoveryScanHistoryDALFactory,
    "findLatestByDiscoveryId" | "findByDiscoveryId" | "countByDiscoveryId"
  >;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  gatewayV2DAL: Pick<TGatewayV2DALFactory, "findOne">;
  gatewayPoolDAL: Pick<TGatewayPoolDALFactory, "findById">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveAttachableGatewayFromPool">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
  appConnectionService: Pick<TAppConnectionServiceFactory, "validateAppConnectionUsageById">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "find">;
  queuePkiDiscoveryScan: (discoveryId: string) => Promise<void>;
};

export type TPkiDiscoveryServiceFactory = ReturnType<typeof pkiDiscoveryServiceFactory>;

export const pkiDiscoveryServiceFactory = ({
  pkiDiscoveryConfigDAL,
  pkiDiscoveryScanHistoryDAL,
  permissionService,
  licenseService,
  gatewayV2DAL,
  gatewayPoolDAL,
  gatewayPoolService,
  orgDAL,
  appConnectionService,
  appConnectionDAL,
  queuePkiDiscoveryScan
}: TPkiDiscoveryServiceFactoryDep) => {
  const $parseTargetConfig = <T>(schema: z.ZodTypeAny, targetConfig: TPkiDiscoveryTargetConfig): T => {
    const parsed = schema.safeParse(targetConfig);
    if (!parsed.success) {
      throw new BadRequestError({ message: parsed.error.issues.slice(0, 3).map(formatTargetConfigIssue).join("; ") });
    }
    return parsed.data as T;
  };

  const $validateNetworkTarget = (targetConfig: TPkiDiscoveryTargetConfig, hasGateway: boolean) => {
    const config = $parseTargetConfig<TNetworkTargetConfig>(NetworkTargetConfigSchema, targetConfig);
    const validation = validateTargetConfig(config.ipRanges, config.ports, config.domains, hasGateway);
    if (!validation.valid) {
      throw new BadRequestError({ message: validation.error || "Invalid target configuration" });
    }
    return config;
  };

  const $validateLinuxServerTarget = async (
    targetConfig: TPkiDiscoveryTargetConfig,
    projectId: string,
    actor: OrgServiceActor
  ): Promise<TLinuxServerTargetConfig> => {
    const config = $parseTargetConfig<TLinuxServerTargetConfig>(LinuxServerTargetConfigSchema, targetConfig);
    const limit = pLimit(CONNECTION_VALIDATION_CONCURRENCY);
    const connections = await Promise.all(
      config.connectionIds.map((connectionId) =>
        limit(() =>
          appConnectionService.validateAppConnectionUsageById(AppConnection.SSH, { connectionId, projectId }, actor)
        )
      )
    );
    const connectionWithoutGateway = connections.find(
      (connection) => !connection.gatewayId && !connection.gatewayPoolId
    );
    if (connectionWithoutGateway) {
      throw new BadRequestError({ message: sshConnectionWithoutGatewayMessage(connectionWithoutGateway.name) });
    }
    return config;
  };

  const $assertJobGatewayAllowed = (discoveryType: PkiDiscoveryType, hasJobGateway: boolean) => {
    if (discoveryType !== PkiDiscoveryType.Network && hasJobGateway) {
      throw new BadRequestError({
        message:
          "Linux Server discovery uses the gateway of each SSH connection, so a gateway or gateway pool cannot be set on the job"
      });
    }
  };

  const $validateTarget = async ({
    discoveryType,
    targetConfig,
    hasGateway,
    projectId,
    actor
  }: {
    discoveryType: PkiDiscoveryType;
    targetConfig: TPkiDiscoveryTargetConfig;
    hasGateway: boolean;
    projectId: string;
    actor: OrgServiceActor;
  }): Promise<TPkiDiscoveryTargetConfig> => {
    switch (discoveryType) {
      case PkiDiscoveryType.Network:
        return $validateNetworkTarget(targetConfig, hasGateway);
      case PkiDiscoveryType.LinuxServer:
        return $validateLinuxServerTarget(targetConfig, projectId, actor);
      default:
        throw new BadRequestError({ message: `Unsupported discovery type: ${discoveryType as string}` });
    }
  };

  const createDiscovery = async ({
    projectId,
    name,
    description,
    discoveryType = PkiDiscoveryType.Network,
    targetConfig,
    isAutoScanEnabled,
    scanIntervalDays,
    gatewayId,
    gatewayPoolId,
    orgActor,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TCreatePkiDiscoveryDTO) => {
    if (gatewayId && gatewayPoolId) {
      throw new BadRequestError({ message: "Cannot specify both a gateway and a gateway pool" });
    }

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

    // Creation only; existing discoveries keep scanning and stay editable.
    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.pkiDiscovery) {
      throw new BadRequestError({
        message:
          "Failed to create certificate discovery due to plan restriction. Upgrade plan to use certificate discovery."
      });
    }

    const appCfg = getConfig();
    if (appCfg.isCloud) {
      const existingCount = await pkiDiscoveryConfigDAL.countByProjectId(projectId);
      if (existingCount >= MAX_CLOUD_DISCOVERIES) {
        throw new BadRequestError({
          message: `Maximum number of discovery configurations (${MAX_CLOUD_DISCOVERIES}) reached`
        });
      }
    }

    $assertJobGatewayAllowed(discoveryType, Boolean(gatewayId || gatewayPoolId));
    const validatedTargetConfig = await $validateTarget({
      discoveryType,
      targetConfig,
      hasGateway: Boolean(gatewayId || gatewayPoolId),
      projectId,
      actor: orgActor
    });

    if (gatewayId) {
      const gateway = await gatewayV2DAL.findOne({ id: gatewayId, orgId: actorOrgId });
      if (!gateway) {
        throw new BadRequestError({ message: "Gateway not found or does not belong to this organization" });
      }

      const { permission: orgPermission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: actorOrgId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(orgPermission).throwUnlessCan(
        OrgPermissionGatewayActions.AttachGateways,
        OrgPermissionSubjects.Gateway
      );

      await assertIndividualGatewayAllowed({ orgDAL, orgId: actorOrgId, gatewayId });
    } else if (gatewayPoolId) {
      await gatewayPoolService.resolveAttachableGatewayFromPool({
        poolId: gatewayPoolId,
        orgId: actorOrgId,
        actor: { type: actor, id: actorId, orgId: actorOrgId, authMethod: actorAuthMethod }
      });
    }

    try {
      const discovery = await pkiDiscoveryConfigDAL.create({
        projectId,
        name,
        description,
        discoveryType,
        targetConfig: validatedTargetConfig,
        isAutoScanEnabled: isAutoScanEnabled ?? false,
        scanIntervalDays: isAutoScanEnabled ? scanIntervalDays : null,
        gatewayId: gatewayPoolId ? null : gatewayId,
        gatewayPoolId: gatewayPoolId ?? null,
        isActive: true
      });

      return discovery;
    } catch (error) {
      const dbError = error instanceof DatabaseError ? (error.error as { code?: string }) : null;
      if (dbError?.code === "23505") {
        throw new BadRequestError({
          message: `A discovery configuration with name '${name}' already exists in this project`
        });
      }
      throw error;
    }
  };

  const updateDiscovery = async ({
    discoveryId,
    name,
    description,
    targetConfig,
    isAutoScanEnabled,
    scanIntervalDays,
    gatewayId,
    gatewayPoolId,
    isActive,
    orgActor,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TUpdatePkiDiscoveryDTO) => {
    if (gatewayId && gatewayPoolId) {
      throw new BadRequestError({ message: "Cannot specify both a gateway and a gateway pool" });
    }

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

    const discoveryType = (discovery.discoveryType as PkiDiscoveryType) || PkiDiscoveryType.Network;
    const effectiveHasGateway =
      gatewayId !== undefined || gatewayPoolId !== undefined
        ? Boolean(gatewayId || gatewayPoolId)
        : Boolean(discovery.gatewayId || discovery.gatewayPoolId);

    $assertJobGatewayAllowed(discoveryType, Boolean(gatewayId || gatewayPoolId));

    const validatedTargetConfig = targetConfig
      ? await $validateTarget({
          discoveryType,
          targetConfig,
          hasGateway: effectiveHasGateway,
          projectId: discovery.projectId,
          actor: orgActor
        })
      : undefined;

    if (gatewayId) {
      const gateway = await gatewayV2DAL.findOne({ id: gatewayId, orgId: actorOrgId });
      if (!gateway) {
        throw new BadRequestError({ message: "Gateway not found or does not belong to this organization" });
      }

      const { permission: orgPermission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: actorOrgId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(orgPermission).throwUnlessCan(
        OrgPermissionGatewayActions.AttachGateways,
        OrgPermissionSubjects.Gateway
      );

      await assertIndividualGatewayAllowed({
        orgDAL,
        orgId: actorOrgId,
        gatewayId,
        previousGatewayId: discovery.gatewayId
      });
    } else if (gatewayPoolId && gatewayPoolId !== discovery.gatewayPoolId) {
      await gatewayPoolService.resolveAttachableGatewayFromPool({
        poolId: gatewayPoolId,
        orgId: actorOrgId,
        actor: { type: actor, id: actorId, orgId: actorOrgId, authMethod: actorAuthMethod }
      });
    }

    const gatewayIdValue = gatewayPoolId ? null : gatewayId;
    const gatewayPoolIdValue = gatewayId ? null : gatewayPoolId;

    try {
      const updatedDiscovery = await pkiDiscoveryConfigDAL.updateById(discoveryId, {
        name,
        description,
        targetConfig: validatedTargetConfig,
        isAutoScanEnabled,
        scanIntervalDays: isAutoScanEnabled ? scanIntervalDays : null,
        gatewayId: gatewayIdValue,
        gatewayPoolId: gatewayPoolIdValue,
        isActive
      });

      return updatedDiscovery;
    } catch (error) {
      const dbError = error instanceof DatabaseError ? (error.error as { code?: string }) : null;
      if (dbError?.code === "23505") {
        throw new BadRequestError({
          message: `A discovery configuration with name '${name}' already exists in this project`
        });
      }
      throw error;
    }
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

  const $attachConnections = async <T extends { discoveryType: string; targetConfig?: unknown }>(
    discoveries: T[],
    orgId: string
  ) => {
    const connectionIdsOf = (discovery: T) =>
      discovery.discoveryType === PkiDiscoveryType.LinuxServer
        ? (discovery.targetConfig as TLinuxServerTargetConfig).connectionIds
        : [];
    const connectionIds = [...new Set(discoveries.flatMap(connectionIdsOf))];
    const rows = connectionIds.length ? await appConnectionDAL.find({ $in: { id: connectionIds }, orgId }) : [];
    const connectionsById = new Map(
      rows.map((row) => [row.id, { id: row.id, name: row.name, app: row.app as AppConnection }])
    );
    return discoveries.map((discovery) => ({
      ...discovery,
      connections: connectionIdsOf(discovery).flatMap((id) => {
        const connection = connectionsById.get(id);
        return connection ? [connection] : [];
      })
    }));
  };

  const getDiscovery = async ({ discoveryId, actor, actorId, actorAuthMethod, actorOrgId }: TGetPkiDiscoveryDTO) => {
    const discovery = await pkiDiscoveryConfigDAL.findByIdWithInstallationCounts(discoveryId);
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

    let gatewayName: string | null = null;
    let gatewayPoolName: string | null = null;
    if (discovery.gatewayId) {
      const gateway = await gatewayV2DAL.findOne({ id: discovery.gatewayId });
      if (gateway) {
        gatewayName = gateway.name;
      }
    } else if (discovery.gatewayPoolId) {
      const pool = await gatewayPoolDAL.findById(discovery.gatewayPoolId);
      if (pool) {
        gatewayPoolName = pool.name;
      }
    }

    const [discoveryWithConnections] = await $attachConnections([discovery], actorOrgId);

    return { ...discoveryWithConnections, gatewayName, gatewayPoolName };
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

    return { discoveries: await $attachConnections(discoveries, actorOrgId), totalCount };
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
