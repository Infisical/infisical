import { ForbiddenError, subject } from "@casl/ability";

import { ActionProjectType, OrganizationActionScope, TPamDiscoverySources } from "@app/db/schemas";
import { TPamAccountDALFactory } from "@app/ee/services/pam-account/pam-account-dal";
import { OrgPermissionGatewayActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionActions,
  ProjectPermissionPamAccountActions,
  ProjectPermissionPamDiscoveryActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { TGatewayV2DALFactory } from "../gateway-v2/gateway-v2-dal";
import { TGatewayV2ServiceFactory } from "../gateway-v2/gateway-v2-service";
import { TPamResourceDALFactory } from "../pam-resource/pam-resource-dal";
import { decryptResourceMetadata } from "../pam-resource/pam-resource-fns";
import { TPamAccountDependenciesDALFactory } from "./pam-account-dependencies-dal";
import { PamDiscoverySourceRunStatus, PamDiscoverySourceStatus, PamDiscoveryType } from "./pam-discovery-enums";
import { PAM_DISCOVERY_FACTORY_MAP } from "./pam-discovery-factory";
import {
  decryptDiscoveryCredentials,
  decryptDiscoverySource,
  encryptDiscoveryCredentials,
  listDiscoverySourceOptions
} from "./pam-discovery-fns";
import { TPamDiscoveryQueueFactory } from "./pam-discovery-queue";
import { TPamDiscoverySourceAccountsDALFactory } from "./pam-discovery-source-accounts-dal";
import { TPamDiscoverySourceDALFactory } from "./pam-discovery-source-dal";
import { TPamDiscoverySourceDependenciesDALFactory } from "./pam-discovery-source-dependencies-dal";
import { TPamDiscoverySourceResourcesDALFactory } from "./pam-discovery-source-resources-dal";
import { TPamDiscoverySourceRunDALFactory } from "./pam-discovery-source-run-dal";
import {
  TCreatePamDiscoverySourceDTO,
  TGetDiscoveredAccountsDTO,
  TGetDiscoveredResourcesDTO,
  TGetPamDiscoverySourceRunDTO,
  TGetPamDiscoverySourceRunsDTO,
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
    TPamDiscoverySourceRunDALFactory,
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
  pamDiscoverySourceDependenciesDAL: Pick<TPamDiscoverySourceDependenciesDALFactory, "countByDiscoverySourceIds">;
  pamAccountDependenciesDAL: Pick<
    TPamAccountDependenciesDALFactory,
    | "countByAccountIds"
    | "countByResourceIds"
    | "findByAccountId"
    | "findByResourceId"
    | "findById"
    | "updateById"
    | "deleteById"
  >;
  pamAccountDAL: Pick<TPamAccountDALFactory, "findByIdWithParentDetails" | "findMetadataByAccountIds">;
  pamResourceDAL: Pick<TPamResourceDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
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
  pamDiscoverySourceDependenciesDAL,
  pamAccountDependenciesDAL,
  pamAccountDAL,
  pamResourceDAL,
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

    const { permission: orgPermission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor: actor.type,
      actorId: actor.id,
      orgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId
    });

    ForbiddenError.from(orgPermission).throwUnlessCan(
      OrgPermissionGatewayActions.AttachGateways,
      OrgPermissionSubjects.Gateway
    );

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

    if (gatewayId && gatewayId !== discoverySource.gatewayId) {
      const { permission: orgPermission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor: actor.type,
        actorId: actor.id,
        orgId: actor.orgId,
        actorAuthMethod: actor.authMethod,
        actorOrgId: actor.orgId
      });

      ForbiddenError.from(orgPermission).throwUnlessCan(
        OrgPermissionGatewayActions.AttachGateways,
        OrgPermissionSubjects.Gateway
      );

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

    const [resourceCounts, accountCounts, dependencyCounts]: { [k: string]: number }[] = await Promise.all([
      sourceIds.length ? pamDiscoverySourceResourcesDAL.countByDiscoverySourceIds(sourceIds) : {},
      sourceIds.length ? pamDiscoverySourceAccountsDAL.countByDiscoverySourceIds(sourceIds) : {},
      sourceIds.length ? pamDiscoverySourceDependenciesDAL.countByDiscoverySourceIds(sourceIds) : {}
    ]);

    return {
      sources: await Promise.all(
        sources.map(async (src) => ({
          ...(await decryptDiscoverySource(src, projectId, kmsService)),
          totalResources: resourceCounts[src.id] ?? 0,
          totalAccounts: accountCounts[src.id] ?? 0,
          totalDependencies: dependencyCounts[src.id] ?? 0
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
    if (latestRun && latestRun.status === PamDiscoverySourceRunStatus.Running) {
      throw new BadRequestError({ message: "A scan is already in progress for this Discovery Source" });
    }

    await pamDiscoveryQueue.queuePamDiscoveryScan(id);

    return { message: "Scan queued successfully", discoverySource };
  };

  const getDiscoveryRuns = async (
    { discoverySourceId, offset, limit }: TGetPamDiscoverySourceRunsDTO,
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
    return { ...result, discoverySource };
  };

  const getDiscoveryRunById = async (
    { discoverySourceId, runId }: TGetPamDiscoverySourceRunDTO,
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

    const run = await pamDiscoveryRunDAL.findById(runId);
    if (!run || run.discoverySourceId !== discoverySourceId) {
      throw new NotFoundError({ message: `Discovery Run with ID '${runId}' not found` });
    }

    return { run, discoverySource };
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

    const { resources, totalCount } = await pamDiscoverySourceResourcesDAL.findByDiscoverySourceIdWithResources(
      discoverySourceId,
      { offset, limit }
    );

    const decryptedResources = await Promise.all(
      resources.map(async (resource) => {
        const { encryptedResourceMetadata, ...rest } = resource as typeof resource & {
          encryptedResourceMetadata?: Buffer | null;
        };
        if (!encryptedResourceMetadata) return rest;
        try {
          const resourceInternalMetadata = await decryptResourceMetadata({
            projectId: discoverySource.projectId,
            encryptedMetadata: encryptedResourceMetadata,
            kmsService
          });
          return { ...rest, resourceInternalMetadata };
        } catch {
          return rest;
        }
      })
    );

    // Add dependency counts per resource
    const resourceIds = decryptedResources.map((r) => r.resourceId).filter(Boolean);
    const depCountsByResource = resourceIds.length
      ? await pamAccountDependenciesDAL.countByResourceIds(resourceIds)
      : {};

    const resourcesWithDeps = decryptedResources.map((r) => ({
      ...r,
      dependencyCount: (r.resourceId ? depCountsByResource[r.resourceId] : 0) ?? 0
    }));

    return { resources: resourcesWithDeps, totalCount, discoverySource };
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

    // Add dependency counts per account
    const accountIds = result.accounts.map((a) => a.accountId).filter(Boolean);
    const depCountsByAccount = accountIds.length ? await pamAccountDependenciesDAL.countByAccountIds(accountIds) : {};

    const accountsWithDeps = result.accounts.map((a) => ({
      ...a,
      dependencyCount: (a.accountId ? depCountsByAccount[a.accountId] : 0) ?? 0
    }));

    return { accounts: accountsWithDeps, totalCount: result.totalCount, discoverySource };
  };

  const verifyAccountPermission = async (
    accountId: string,
    action: ProjectPermissionPamAccountActions,
    actor: ActorType,
    actorId: string,
    actorAuthMethod: ActorAuthMethod,
    actorOrgId: string
  ) => {
    const accountWithParent = await pamAccountDAL.findByIdWithParentDetails(accountId);
    if (!accountWithParent) throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: accountWithParent.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.PAM
    });

    const metadataByAccountId = await pamAccountDAL.findMetadataByAccountIds([accountWithParent.id]);
    const accountMetadata = metadataByAccountId[accountWithParent.id] || [];

    ForbiddenError.from(permission).throwUnlessCan(
      action,
      subject(ProjectPermissionSub.PamAccounts, {
        accountName: accountWithParent.name,
        ...(accountWithParent.resource && {
          resourceName: accountWithParent.resource.name,
          resourceType: accountWithParent.resource.resourceType
        }),
        ...(accountWithParent.domain && {
          domainName: accountWithParent.domain.name,
          domainType: accountWithParent.domain.domainType
        }),
        metadata: accountMetadata
      })
    );

    return accountWithParent;
  };

  const decryptDependencySyncMessages = async <T extends { encryptedLastSyncMessage?: Buffer | null }>(
    deps: T[],
    projectId: string
  ): Promise<(T & { lastSyncMessage: string | null })[]> => {
    if (!deps.length) return deps.map((d) => ({ ...d, lastSyncMessage: null as string | null }));

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    return deps.map((dep) => {
      let lastSyncMessage: string | null = null;
      if (dep.encryptedLastSyncMessage) {
        try {
          lastSyncMessage = decryptor({ cipherTextBlob: dep.encryptedLastSyncMessage }).toString();
        } catch {
          lastSyncMessage = "Failed to decrypt error message";
        }
      }
      return { ...dep, lastSyncMessage };
    });
  };

  const getAccountDependencies = async ({
    accountId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: {
    accountId: string;
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
  }) => {
    const accountWithParent = await verifyAccountPermission(
      accountId,
      ProjectPermissionPamAccountActions.Read,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    );
    const deps = await pamAccountDependenciesDAL.findByAccountId(accountId);
    return decryptDependencySyncMessages(deps, accountWithParent.projectId);
  };

  const getResourceDependencies = async ({
    resourceId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: {
    resourceId: string;
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
  }) => {
    const resource = await pamResourceDAL.findById(resourceId);
    if (!resource) throw new NotFoundError({ message: `Resource with ID '${resourceId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: resource.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.PamResources, { name: resource.name, resourceType: resource.resourceType })
    );

    const deps = await pamAccountDependenciesDAL.findByResourceId(resourceId);
    return decryptDependencySyncMessages(deps, resource.projectId);
  };

  const updateAccountDependency = async ({
    accountId,
    dependencyId,
    isRotationSyncEnabled,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: {
    accountId: string;
    dependencyId: string;
    isRotationSyncEnabled: boolean;
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
  }) => {
    await verifyAccountPermission(
      accountId,
      ProjectPermissionPamAccountActions.Edit,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    );

    const dep = await pamAccountDependenciesDAL.findById(dependencyId);
    if (!dep || dep.accountId !== accountId) {
      throw new NotFoundError({ message: "Dependency not found" });
    }
    return pamAccountDependenciesDAL.updateById(dependencyId, { isRotationSyncEnabled });
  };

  const deleteAccountDependency = async ({
    accountId,
    dependencyId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: {
    accountId: string;
    dependencyId: string;
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
  }) => {
    await verifyAccountPermission(
      accountId,
      ProjectPermissionPamAccountActions.Edit,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    );

    const dep = await pamAccountDependenciesDAL.findById(dependencyId);
    if (!dep || dep.accountId !== accountId) {
      throw new NotFoundError({ message: "Dependency not found" });
    }
    return pamAccountDependenciesDAL.deleteById(dependencyId);
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
    getAccountDependencies,
    getResourceDependencies,
    updateAccountDependency,
    deleteAccountDependency,
    listDiscoverySourceOptions
  };
};
