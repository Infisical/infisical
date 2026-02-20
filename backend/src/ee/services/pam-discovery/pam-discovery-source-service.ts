import { ForbiddenError } from "@casl/ability";

import { ActionProjectType, TPamDiscoverySources } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionPamDiscoveryActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TGatewayV2DALFactory } from "../gateway-v2/gateway-v2-dal";
import { TGatewayV2ServiceFactory } from "../gateway-v2/gateway-v2-service";
import { PamDiscoveryRunStatus, PamDiscoverySourceStatus, PamDiscoveryType } from "./pam-discovery-enums";
import { PAM_DISCOVERY_FACTORY_MAP } from "./pam-discovery-factory";
import {
  decryptDiscoveryCredentials,
  decryptDiscoverySource,
  encryptDiscoveryCredentials,
  listDiscoverySourceOptions
} from "./pam-discovery-fns";
import { TPamDiscoveryQueueFactory } from "./pam-discovery-queue";
import { TPamDiscoveryRunDALFactory } from "./pam-discovery-run-dal";
import { TPamDiscoverySourceAccountsDALFactory } from "./pam-discovery-source-accounts-dal";
import { TPamDiscoverySourceDALFactory } from "./pam-discovery-source-dal";
import { TPamDiscoverySourceResourcesDALFactory } from "./pam-discovery-source-resources-dal";
import {
  TCreatePamDiscoverySourceDTO,
  TGetDiscoveredAccountsDTO,
  TGetDiscoveredResourcesDTO,
  TGetPamDiscoveryRunDTO,
  TGetPamDiscoveryRunsDTO,
  TListPamDiscoverySourcesDTO,
  TPamDiscoveryConfiguration,
  TPamDiscoveryCredentials,
  TUpdatePamDiscoverySourceDTO
} from "./pam-discovery-types";

type TPamDiscoverySourceServiceFactoryDep = {
  pamDiscoverySourceDAL: Pick<
    TPamDiscoverySourceDALFactory,
    "create" | "findById" | "updateById" | "deleteById" | "findByProjectId"
  >;
  pamDiscoveryRunDAL: Pick<
    TPamDiscoveryRunDALFactory,
    "findByDiscoverySourceId" | "findLatestBySourceId" | "findById" | "find"
  >;
  pamDiscoverySourceResourcesDAL: Pick<
    TPamDiscoverySourceResourcesDALFactory,
    "findByDiscoverySourceIdWithResources" | "countByDiscoverySourceIds"
  >;
  pamDiscoverySourceAccountsDAL: Pick<
    TPamDiscoverySourceAccountsDALFactory,
    "findByDiscoverySourceIdWithAccounts" | "countByDiscoverySourceIds"
  >;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  gatewayV2DAL: Pick<TGatewayV2DALFactory, "findOne">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  pamDiscoveryQueue: Pick<TPamDiscoveryQueueFactory, "queuePamDiscoveryScan">;
};

export type TPamDiscoverySourceServiceFactory = ReturnType<typeof pamDiscoverySourceServiceFactory>;

export const pamDiscoverySourceServiceFactory = ({
  pamDiscoverySourceDAL,
  pamDiscoveryRunDAL,
  pamDiscoverySourceResourcesDAL,
  pamDiscoverySourceAccountsDAL,
  permissionService,
  kmsService,
  gatewayV2DAL,
  gatewayV2Service,
  pamDiscoveryQueue
}: TPamDiscoverySourceServiceFactoryDep) => {
  const create = async (
    {
      projectId,
      name,
      discoveryType,
      gatewayId,
      discoveryCredentials,
      discoveryConfiguration,
      schedule
    }: TCreatePamDiscoverySourceDTO,
    actor: OrgServiceActor
  ) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamDiscoveryActions.Create,
      ProjectPermissionSub.PamDiscovery
    );

    // Validate gateway exists
    const gateway = await gatewayV2DAL.findOne({ id: gatewayId, orgId: actor.orgId });
    if (!gateway) {
      throw new BadRequestError({ message: "Gateway not found or does not belong to this organization" });
    }

    const factory = PAM_DISCOVERY_FACTORY_MAP[discoveryType](
      discoveryType,
      discoveryConfiguration,
      discoveryCredentials,
      gatewayId,
      projectId,
      gatewayV2Service
    );
    await factory.validateConnection();

    const encryptedDiscoveryCredentials = await encryptDiscoveryCredentials({
      projectId,
      credentials: discoveryCredentials,
      kmsService
    });

    try {
      const discoverySource = await pamDiscoverySourceDAL.create({
        projectId,
        name,
        discoveryType,
        gatewayId,
        encryptedDiscoveryCredentials,
        discoveryConfiguration,
        schedule,
        status: PamDiscoverySourceStatus.Active
      });

      return await decryptDiscoverySource(discoverySource, projectId, kmsService);
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation) {
        throw new BadRequestError({
          message: `Discovery Source with name '${name}' already exists for this project`
        });
      }
      throw err;
    }
  };

  const updateById = async (
    {
      discoverySourceId,
      name,
      gatewayId,
      discoveryCredentials,
      discoveryConfiguration,
      schedule
    }: TUpdatePamDiscoverySourceDTO,
    actor: OrgServiceActor
  ) => {
    const discoverySource = await pamDiscoverySourceDAL.findById(discoverySourceId);
    if (!discoverySource) {
      throw new NotFoundError({ message: `Discovery Source with ID '${discoverySourceId}' not found` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: discoverySource.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamDiscoveryActions.Edit,
      ProjectPermissionSub.PamDiscovery
    );

    const updateDoc: Partial<TPamDiscoverySources> = {};

    if (gatewayId) {
      const gateway = await gatewayV2DAL.findOne({ id: gatewayId, orgId: actor.orgId });
      if (!gateway) {
        throw new BadRequestError({ message: "Gateway not found or does not belong to this organization" });
      }
      updateDoc.gatewayId = gatewayId;
    }

    if (name !== undefined) updateDoc.name = name;
    if (discoveryConfiguration !== undefined) updateDoc.discoveryConfiguration = discoveryConfiguration;
    if (schedule !== undefined) updateDoc.schedule = schedule;

    let finalCredentials: TPamDiscoveryCredentials | undefined;
    if (discoveryCredentials) {
      finalCredentials = { ...discoveryCredentials };

      // Handle unchanged password sentinel
      if (discoverySource.encryptedDiscoveryCredentials) {
        const currentCredentials = await decryptDiscoveryCredentials({
          projectId: discoverySource.projectId,
          encryptedCredentials: discoverySource.encryptedDiscoveryCredentials,
          kmsService
        });

        if (
          "password" in finalCredentials &&
          (finalCredentials as { password?: string }).password === "__INFISICAL_UNCHANGED__" &&
          "password" in currentCredentials
        ) {
          finalCredentials = {
            ...finalCredentials,
            password: (currentCredentials as { password: string }).password
          };
        }
      }

      updateDoc.encryptedDiscoveryCredentials = await encryptDiscoveryCredentials({
        projectId: discoverySource.projectId,
        credentials: finalCredentials,
        kmsService
      });
    }

    // Validate if connection details changed
    if (gatewayId || discoveryConfiguration || discoveryCredentials) {
      const effectiveGatewayId = gatewayId ?? discoverySource.gatewayId;
      const effectiveConfiguration = (discoveryConfiguration ??
        discoverySource.discoveryConfiguration) as TPamDiscoveryConfiguration;

      let effectiveCredentials = finalCredentials;
      if (!effectiveCredentials && discoverySource.encryptedDiscoveryCredentials) {
        effectiveCredentials = await decryptDiscoveryCredentials({
          projectId: discoverySource.projectId,
          encryptedCredentials: discoverySource.encryptedDiscoveryCredentials,
          kmsService
        });
      }

      if (effectiveGatewayId && effectiveCredentials) {
        const factory = PAM_DISCOVERY_FACTORY_MAP[discoverySource.discoveryType as PamDiscoveryType](
          discoverySource.discoveryType as PamDiscoveryType,
          effectiveConfiguration,
          effectiveCredentials,
          effectiveGatewayId,
          discoverySource.projectId,
          gatewayV2Service
        );
        await factory.validateConnection();
      }
    }

    // If nothing was updated, return the fetched resource
    if (Object.keys(updateDoc).length === 0) {
      return decryptDiscoverySource(discoverySource, discoverySource.projectId, kmsService);
    }

    try {
      const updatedResource = await pamDiscoverySourceDAL.updateById(discoverySourceId, updateDoc);
      return await decryptDiscoverySource(updatedResource, discoverySource.projectId, kmsService);
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation) {
        throw new BadRequestError({
          message: `Discovery Source with name '${name}' already exists for this project`
        });
      }
      throw err;
    }
  };

  const deleteById = async (id: string, actor: OrgServiceActor) => {
    const discoverySource = await pamDiscoverySourceDAL.findById(id);
    if (!discoverySource) {
      throw new NotFoundError({ message: `Discovery Source with ID '${id}' not found` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: discoverySource.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamDiscoveryActions.Delete,
      ProjectPermissionSub.PamDiscovery
    );

    await pamDiscoverySourceDAL.deleteById(id);

    return decryptDiscoverySource(discoverySource, discoverySource.projectId, kmsService);
  };

  const getById = async (id: string, discoveryType: PamDiscoveryType, actor: OrgServiceActor) => {
    const discoverySource = await pamDiscoverySourceDAL.findById(id);
    if (!discoverySource) throw new NotFoundError({ message: `Discovery source with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: discoverySource.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamDiscoveryActions.Read,
      ProjectPermissionSub.PamDiscovery
    );

    if (discoverySource.discoveryType !== discoveryType) {
      throw new BadRequestError({
        message: `Discovery source with ID '${id}' is not of type '${discoveryType}'`
      });
    }

    return decryptDiscoverySource(discoverySource, discoverySource.projectId, kmsService);
  };

  const list = async ({
    projectId,
    offset,
    limit,
    search,
    orderBy,
    orderDirection,
    filterDiscoveryTypes,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TListPamDiscoverySourcesDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamDiscoveryActions.Read,
      ProjectPermissionSub.PamDiscovery
    );

    const { sources, totalCount } = await pamDiscoverySourceDAL.findByProjectId(projectId, {
      offset,
      limit,
      search,
      orderBy,
      orderDirection,
      filterDiscoveryTypes
    });

    const sourceIds = sources.map((s) => s.id);

    const [resourceCounts, accountCounts]: { [k: string]: number }[] = await Promise.all([
      sourceIds.length ? pamDiscoverySourceResourcesDAL.countByDiscoverySourceIds(sourceIds) : {},
      sourceIds.length ? pamDiscoverySourceAccountsDAL.countByDiscoverySourceIds(sourceIds) : {}
    ]);

    return {
      sources: await Promise.all(
        sources.map(async (src) => ({
          ...(await decryptDiscoverySource(src, projectId, kmsService)),
          totalResources: resourceCounts[src.id] ?? 0,
          totalAccounts: accountCounts[src.id] ?? 0
        }))
      ),
      totalCount
    };
  };

  const triggerScanById = async (id: string, actor: OrgServiceActor) => {
    const discoverySource = await pamDiscoverySourceDAL.findById(id);
    if (!discoverySource) {
      throw new NotFoundError({ message: `Discovery Source with ID '${id}' not found` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: discoverySource.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamDiscoveryActions.RunScan,
      ProjectPermissionSub.PamDiscovery
    );

    if (discoverySource.status !== PamDiscoverySourceStatus.Active) {
      throw new BadRequestError({ message: "Cannot trigger scan on a non-active Discovery Source" });
    }

    // Check if a scan is already running
    const latestRun = await pamDiscoveryRunDAL.findLatestBySourceId(id);
    if (latestRun && latestRun.status === PamDiscoveryRunStatus.Running) {
      throw new BadRequestError({ message: "A scan is already in progress for this Discovery Source" });
    }

    await pamDiscoveryQueue.queuePamDiscoveryScan(id);

    return { message: "Scan queued successfully" };
  };

  const getDiscoveryRuns = async (
    { discoverySourceId, offset, limit }: TGetPamDiscoveryRunsDTO,
    actor: OrgServiceActor
  ) => {
    const discoverySource = await pamDiscoverySourceDAL.findById(discoverySourceId);
    if (!discoverySource) {
      throw new NotFoundError({ message: `Discovery Source with ID '${discoverySourceId}' not found` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: discoverySource.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamDiscoveryActions.Read,
      ProjectPermissionSub.PamDiscovery
    );

    const result = await pamDiscoveryRunDAL.findByDiscoverySourceId(discoverySourceId, { offset, limit });
    return result;
  };

  const getDiscoveryRunById = async ({ discoverySourceId, runId }: TGetPamDiscoveryRunDTO, actor: OrgServiceActor) => {
    const discoverySource = await pamDiscoverySourceDAL.findById(discoverySourceId);
    if (!discoverySource) {
      throw new NotFoundError({ message: `Discovery Source with ID '${discoverySourceId}' not found` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: discoverySource.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamDiscoveryActions.Read,
      ProjectPermissionSub.PamDiscovery
    );

    const run = await pamDiscoveryRunDAL.findById(runId);
    if (!run || run.discoverySourceId !== discoverySourceId) {
      throw new NotFoundError({ message: `Discovery Run with ID '${runId}' not found` });
    }

    return run;
  };

  const getDiscoveredResources = async (
    { discoverySourceId, offset, limit }: TGetDiscoveredResourcesDTO,
    actor: OrgServiceActor
  ) => {
    const discoverySource = await pamDiscoverySourceDAL.findById(discoverySourceId);
    if (!discoverySource) {
      throw new NotFoundError({ message: `Discovery Source with ID '${discoverySourceId}' not found` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: discoverySource.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamDiscoveryActions.Read,
      ProjectPermissionSub.PamDiscovery
    );

    const result = await pamDiscoverySourceResourcesDAL.findByDiscoverySourceIdWithResources(discoverySourceId, {
      offset,
      limit
    });
    return result;
  };

  const getDiscoveredAccounts = async (
    { discoverySourceId, offset, limit }: TGetDiscoveredAccountsDTO,
    actor: OrgServiceActor
  ) => {
    const discoverySource = await pamDiscoverySourceDAL.findById(discoverySourceId);
    if (!discoverySource) {
      throw new NotFoundError({ message: `Discovery Source with ID '${discoverySourceId}' not found` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: discoverySource.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamDiscoveryActions.Read,
      ProjectPermissionSub.PamDiscovery
    );

    const result = await pamDiscoverySourceAccountsDAL.findByDiscoverySourceIdWithAccounts(discoverySourceId, {
      offset,
      limit
    });
    return result;
  };

  return {
    create,
    updateById,
    deleteById,
    getById,
    list,
    triggerScanById,
    getDiscoveryRuns,
    getDiscoveryRunById,
    getDiscoveredResources,
    getDiscoveredAccounts,
    listDiscoverySourceOptions
  };
};
