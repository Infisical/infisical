import { ForbiddenError } from "@casl/ability";

import { ActionProjectType, OrganizationActionScope, RESOURCE_SCOPE, ResourceType } from "@app/db/schemas";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TGatewayPoolServiceFactory } from "../gateway-pool/gateway-pool-service";
import { TGatewayV2DALFactory } from "../gateway-v2/gateway-v2-dal";
import { isGatewayHealthy } from "../gateway-v2/gateway-v2-fns";
import { TGatewayCapabilities } from "../gateway-v2/gateway-v2-types";
import { TLicenseServiceFactory } from "../license/license-service";
import { OrgPermissionGatewayActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { ProjectPermissionAgentGatewayActions, ProjectPermissionSub } from "../permission/project-permission";
import { TProxiedServiceDALFactory } from "../proxied-service/proxied-service-dal";
import { TAgentGatewayAccessServiceFactory } from "./agent-gateway-access-service";
import { TAgentGatewayDALFactory, TAgentGatewayWithTransport } from "./agent-gateway-dal";
import { AgentGatewayUnmatchedHostPolicy } from "./agent-gateway-enums";
import { TAgentGatewayServiceLinkDALFactory } from "./agent-gateway-service-link-dal";
import {
  TCreateAgentGatewayDTO,
  TDeleteAgentGatewayDTO,
  TGetAgentGatewayByIdDTO,
  TGetAgentGatewayByNameDTO,
  TLinkProxiedServiceDTO,
  TListAgentGatewaysDTO,
  TReorderProxiedServicesDTO,
  TUpdateAgentGatewayDTO
} from "./agent-gateway-types";

export type TAgentGatewayServiceFactory = ReturnType<typeof agentGatewayServiceFactory>;

type TAgentGatewayServiceFactoryDep = {
  agentGatewayDAL: TAgentGatewayDALFactory;
  agentGatewayServiceLinkDAL: TAgentGatewayServiceLinkDALFactory;
  proxiedServiceDAL: Pick<TProxiedServiceDALFactory, "findById">;
  gatewayV2DAL: Pick<TGatewayV2DALFactory, "findById">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveAttachableGatewayFromPool">;
  membershipDAL: Pick<TMembershipDALFactory, "delete" | "countResourceMembershipsByResourceIds">;
  agentGatewayAccessService: Pick<TAgentGatewayAccessServiceFactory, "assertActorMayUse" | "listUsableAgentGatewayIds">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
};

export const agentGatewayServiceFactory = ({
  agentGatewayDAL,
  agentGatewayServiceLinkDAL,
  proxiedServiceDAL,
  gatewayV2DAL,
  gatewayPoolService,
  membershipDAL,
  agentGatewayAccessService,
  permissionService,
  licenseService,
  projectDAL
}: TAgentGatewayServiceFactoryDep) => {
  const $checkLicense = async (orgId: string) => {
    const plan = await licenseService.getPlan(orgId);
    if (!plan.secretsBrokering) {
      throw new BadRequestError({
        message: "Failed to use secrets brokering due to plan restriction. Upgrade your plan to use agent gateways."
      });
    }
  };

  const $getProjectPermission = async (projectId: string, actor: OrgServiceActor) =>
    permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager
    });

  // Referencing a gateway from a project resource is an org-level decision, which is what AttachGateways
  // exists for. Checked on every attach, not only at create, so an edit cannot smuggle in a gateway the
  // actor was never allowed to point at.
  const $assertTransportAttachable = async (
    { gatewayId, gatewayPoolId }: { gatewayId?: string | null; gatewayPoolId?: string | null },
    actor: OrgServiceActor
  ) => {
    if (gatewayId && gatewayPoolId) {
      throw new BadRequestError({ message: "Cannot specify both a gateway and a gateway pool" });
    }

    if (gatewayPoolId) {
      await gatewayPoolService.resolveAttachableGatewayFromPool({
        poolId: gatewayPoolId,
        orgId: actor.orgId,
        actor
      });
      return;
    }

    if (!gatewayId) return;

    const { permission } = await permissionService.getOrgPermission({
      actor: actor.type,
      actorId: actor.id,
      orgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      scope: OrganizationActionScope.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionGatewayActions.AttachGateways,
      OrgPermissionSubjects.Gateway
    );

    const gateway = await gatewayV2DAL.findById(gatewayId);
    if (!gateway || gateway.orgId !== actor.orgId) {
      throw new NotFoundError({ message: `Gateway with ID '${gatewayId}' not found` });
    }
  };

  // Health is derived here rather than shipped as a raw heartbeat pair, so there is one definition of
  // "reachable" and the server can refuse to open a session against an unreachable gateway using the same
  // answer the dashboard shows.
  const $toResponse = (row: TAgentGatewayWithTransport) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    projectId: row.projectId,
    isLocalModeEnabled: row.isLocalModeEnabled,
    unmatchedHostPolicy: row.unmatchedHostPolicy as AgentGatewayUnmatchedHostPolicy,
    allowedHosts: row.allowedHosts ?? [],
    lastUsedAt: row.lastUsedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    gateway: row.gatewayId
      ? {
          id: row.gatewayId,
          name: row.gatewayName as string,
          isHealthy: isGatewayHealthy({ heartbeat: row.gatewayHeartbeat, heartbeatTTL: row.gatewayHeartbeatTTL }),
          supportsAgentProxy: Boolean((row.gatewayCapabilities as TGatewayCapabilities | null)?.agentProxy)
        }
      : null,
    gatewayPool: row.gatewayPoolId ? { id: row.gatewayPoolId, name: row.gatewayPoolName as string } : null
  });

  const $findAgentGateway = async (agentGatewayId: string) => {
    const agentGateway = await agentGatewayDAL.findByIdWithTransport(agentGatewayId);
    if (!agentGateway) {
      throw new NotFoundError({ message: `Agent Gateway with ID '${agentGatewayId}' not found` });
    }
    return agentGateway;
  };

  const $withLinkedServices = async (agentGatewayId: string) => {
    const services = await agentGatewayServiceLinkDAL.findServicesByAgentGatewayIds([agentGatewayId]);
    return services;
  };

  // Hosts are compared case-insensitively at request time, so they are stored lowercase and de-duplicated
  // rather than left as typed. Trailing dots and stray whitespace come from copy-paste and would silently
  // never match.
  const $normaliseAllowedHosts = (hosts: string[]) => [
    ...new Set(hosts.map((host) => host.trim().toLowerCase().replace(/\.$/, "")).filter(Boolean))
  ];

  // Being on the access list has to be enough to find the thing you are allowed to use: the CLI resolves
  // --name to an id before it can open a session, so requiring the Read permission as well would make a
  // grant unusable on its own. Read still governs browsing the project's agent gateways in general.
  const $assertMayReadOrUse = async ({
    agentGatewayId,
    projectId,
    actor
  }: {
    agentGatewayId: string;
    projectId: string;
    actor: OrgServiceActor;
  }) => {
    const { permission } = await $getProjectPermission(projectId, actor);
    if (permission.can(ProjectPermissionAgentGatewayActions.Read, ProjectPermissionSub.AgentGateways)) return;

    try {
      await agentGatewayAccessService.assertActorMayUse({ agentGatewayId, projectId, actor });
    } catch {
      // 404 rather than 403: an actor with neither should not be able to confirm the name exists.
      throw new NotFoundError({ message: `Agent Gateway with ID '${agentGatewayId}' not found` });
    }
  };

  // Local mode off with no Gateway attached is an Agent Gateway nobody can broker through: `connect` has
  // nowhere to run the broker and `run` is refused. Rejected on the effective state rather than the body, so
  // it cannot be reached by turning local mode off in a second request.
  const $assertUsableSomehow = ({
    name,
    isLocalModeEnabled,
    gatewayId,
    gatewayPoolId
  }: {
    name: string;
    isLocalModeEnabled: boolean;
    gatewayId?: string | null;
    gatewayPoolId?: string | null;
  }) => {
    if (isLocalModeEnabled || gatewayId || gatewayPoolId) return;

    throw new BadRequestError({
      message: `Agent Gateway '${name}' would have no way to broker: local mode is off and no Gateway is attached. Attach a Gateway, or allow local mode.`
    });
  };

  const create = async (
    {
      projectId,
      name,
      description,
      gatewayId,
      gatewayPoolId,
      isLocalModeEnabled,
      unmatchedHostPolicy,
      allowedHosts
    }: TCreateAgentGatewayDTO,
    actor: OrgServiceActor
  ) => {
    await $checkLicense(actor.orgId);

    const project = await projectDAL.findById(projectId);
    if (!project) {
      throw new NotFoundError({ message: `Project with ID '${projectId}' not found` });
    }

    const { permission } = await $getProjectPermission(projectId, actor);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentGatewayActions.Create,
      ProjectPermissionSub.AgentGateways
    );

    await $assertTransportAttachable({ gatewayId, gatewayPoolId }, actor);
    $assertUsableSomehow({
      name,
      // Matches the column default, so an omitted flag is judged the same way the row will be stored.
      isLocalModeEnabled: isLocalModeEnabled ?? true,
      gatewayId,
      gatewayPoolId
    });

    const existing = await agentGatewayDAL.findByProjectIdAndName({ projectId, name });
    if (existing) {
      throw new BadRequestError({ message: `An Agent Gateway named '${name}' already exists in this project` });
    }

    const created = await agentGatewayDAL.create({
      projectId,
      name,
      description: description ?? null,
      gatewayId: gatewayId ?? null,
      gatewayPoolId: gatewayPoolId ?? null,
      ...(isLocalModeEnabled !== undefined ? { isLocalModeEnabled } : {}),
      ...(unmatchedHostPolicy !== undefined ? { unmatchedHostPolicy } : {}),
      ...(allowedHosts !== undefined ? { allowedHosts: $normaliseAllowedHosts(allowedHosts) } : {})
    });

    return { ...$toResponse(await $findAgentGateway(created.id)), proxiedServices: [] };
  };

  const list = async (
    { projectId, search, orderDirection, limit, offset }: TListAgentGatewaysDTO,
    actor: OrgServiceActor
  ) => {
    await $checkLicense(actor.orgId);

    // Without Read, the list narrows to the agent gateways the caller may use rather than 403ing: this is
    // what `infisical secrets agent gateway list` shows someone holding only a grant.
    const { permission } = await $getProjectPermission(projectId, actor);
    let usableIds: string[] | null = null;
    if (!permission.can(ProjectPermissionAgentGatewayActions.Read, ProjectPermissionSub.AgentGateways)) {
      usableIds = await agentGatewayAccessService.listUsableAgentGatewayIds({ projectId, actor });
      if (!usableIds.length) {
        ForbiddenError.from(permission).throwUnlessCan(
          ProjectPermissionAgentGatewayActions.Read,
          ProjectPermissionSub.AgentGateways
        );
      }
    }

    const [agentGateways, totalCount] = await Promise.all([
      agentGatewayDAL.findByProjectId({ projectId, search, orderDirection, limit, offset }),
      agentGatewayDAL.countByProjectId({ projectId, search })
    ]);

    const visibleIds = usableIds;
    const visible = visibleIds ? agentGateways.filter((g) => visibleIds.includes(g.id)) : agentGateways;
    const agentGatewayIds = visible.map((g) => g.id);
    const [serviceCounts, accessCounts] = await Promise.all([
      agentGatewayServiceLinkDAL.countByAgentGatewayIds(agentGatewayIds),
      membershipDAL.countResourceMembershipsByResourceIds({
        resourceType: ResourceType.AgentGateway,
        resourceIds: agentGatewayIds
      })
    ]);

    return {
      totalCount: visibleIds ? visible.length : totalCount,
      agentGateways: visible.map((agentGateway) => ({
        ...$toResponse(agentGateway),
        proxiedServiceCount: serviceCounts[agentGateway.id] ?? 0,
        accessCount: accessCounts[agentGateway.id] ?? 0
      }))
    };
  };

  const getById = async ({ agentGatewayId }: TGetAgentGatewayByIdDTO, actor: OrgServiceActor) => {
    await $checkLicense(actor.orgId);

    const agentGateway = await $findAgentGateway(agentGatewayId);
    await $assertMayReadOrUse({
      agentGatewayId: agentGateway.id,
      projectId: agentGateway.projectId,
      actor
    });

    return { ...$toResponse(agentGateway), proxiedServices: await $withLinkedServices(agentGateway.id) };
  };

  // The CLI resolves `--name` through here, so the not-found message has to be useful to someone at a
  // terminal rather than to someone reading the API docs.
  const getByName = async ({ projectId, name }: TGetAgentGatewayByNameDTO, actor: OrgServiceActor) => {
    await $checkLicense(actor.orgId);

    const agentGateway = await agentGatewayDAL.findByProjectIdAndName({ projectId, name });
    if (!agentGateway) {
      throw new NotFoundError({
        message: `Agent Gateway named '${name}' not found in this project`
      });
    }

    await $assertMayReadOrUse({ agentGatewayId: agentGateway.id, projectId, actor });

    return { ...$toResponse(agentGateway), proxiedServices: await $withLinkedServices(agentGateway.id) };
  };

  const updateById = async (
    {
      agentGatewayId,
      name,
      description,
      gatewayId,
      gatewayPoolId,
      isLocalModeEnabled,
      unmatchedHostPolicy,
      allowedHosts
    }: TUpdateAgentGatewayDTO,
    actor: OrgServiceActor
  ) => {
    await $checkLicense(actor.orgId);

    const agentGateway = await $findAgentGateway(agentGatewayId);
    const { permission } = await $getProjectPermission(agentGateway.projectId, actor);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentGatewayActions.Edit,
      ProjectPermissionSub.AgentGateways
    );

    // The effective transport after this update, so setting one side while the other is already set is
    // caught rather than silently violating the single-transport constraint at the database.
    const nextGatewayId = gatewayId !== undefined ? gatewayId : agentGateway.gatewayId;
    const nextGatewayPoolId = gatewayPoolId !== undefined ? gatewayPoolId : agentGateway.gatewayPoolId;
    if (gatewayId !== undefined || gatewayPoolId !== undefined) {
      await $assertTransportAttachable({ gatewayId: nextGatewayId, gatewayPoolId: nextGatewayPoolId }, actor);
    }

    $assertUsableSomehow({
      name: name ?? agentGateway.name,
      isLocalModeEnabled: isLocalModeEnabled !== undefined ? isLocalModeEnabled : agentGateway.isLocalModeEnabled,
      gatewayId: nextGatewayId,
      gatewayPoolId: nextGatewayPoolId
    });

    if (name && name !== agentGateway.name) {
      const existing = await agentGatewayDAL.findByProjectIdAndName({ projectId: agentGateway.projectId, name });
      if (existing) {
        throw new BadRequestError({ message: `An Agent Gateway named '${name}' already exists in this project` });
      }
    }

    await agentGatewayDAL.updateById(agentGateway.id, {
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(gatewayId !== undefined ? { gatewayId } : {}),
      ...(gatewayPoolId !== undefined ? { gatewayPoolId } : {}),
      ...(isLocalModeEnabled !== undefined ? { isLocalModeEnabled } : {}),
      ...(unmatchedHostPolicy !== undefined ? { unmatchedHostPolicy } : {}),
      ...(allowedHosts !== undefined ? { allowedHosts: $normaliseAllowedHosts(allowedHosts) } : {})
    });

    const updated = await $findAgentGateway(agentGateway.id);
    return { ...$toResponse(updated), proxiedServices: await $withLinkedServices(updated.id) };
  };

  const deleteById = async ({ agentGatewayId }: TDeleteAgentGatewayDTO, actor: OrgServiceActor) => {
    await $checkLicense(actor.orgId);

    const agentGateway = await $findAgentGateway(agentGatewayId);
    const { permission } = await $getProjectPermission(agentGateway.projectId, actor);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentGatewayActions.Delete,
      ProjectPermissionSub.AgentGateways
    );

    await agentGatewayDAL.transaction(async (tx) => {
      // memberships.scopeResourceId has no foreign key, so nothing cascades: an access list left behind
      // here is a dangling row that grants nothing and shows up nowhere. Reaped in the same transaction.
      await membershipDAL.delete(
        {
          scope: RESOURCE_SCOPE,
          scopeProjectId: agentGateway.projectId,
          scopeResourceType: ResourceType.AgentGateway,
          scopeResourceId: agentGateway.id
        },
        tx
      );
      await agentGatewayDAL.deleteById(agentGateway.id, tx);
    });

    return $toResponse(agentGateway);
  };

  // Gate 2 of the permission model: linking checks ManageServices and nothing else. Whether the linker
  // can read the secrets the service references is not the question being asked here; that was settled
  // when the service was configured.
  const linkProxiedService = async ({ agentGatewayId, serviceId }: TLinkProxiedServiceDTO, actor: OrgServiceActor) => {
    await $checkLicense(actor.orgId);

    const agentGateway = await $findAgentGateway(agentGatewayId);
    const { permission } = await $getProjectPermission(agentGateway.projectId, actor);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentGatewayActions.ManageServices,
      ProjectPermissionSub.AgentGateways
    );

    const service = await proxiedServiceDAL.findById(serviceId);
    if (!service || service.projectId !== agentGateway.projectId) {
      throw new NotFoundError({ message: `Proxied service with ID '${serviceId}' not found in this project` });
    }

    const existing = await agentGatewayServiceLinkDAL.findOne({ agentGatewayId, serviceId });
    if (existing) {
      throw new BadRequestError({
        message: `Proxied service '${service.name}' is already connected to Agent Gateway '${agentGateway.name}'`
      });
    }

    // Appended, so an existing tie-break order is not disturbed by a new service.
    const links = await agentGatewayServiceLinkDAL.findByAgentGatewayId(agentGatewayId);
    const nextPriority = links.reduce((max, link) => Math.max(max, link.priority), -1) + 1;

    await agentGatewayServiceLinkDAL.create({ agentGatewayId, serviceId, priority: nextPriority });

    return { agentGateway, service };
  };

  const unlinkProxiedService = async (
    { agentGatewayId, serviceId }: TLinkProxiedServiceDTO,
    actor: OrgServiceActor
  ) => {
    await $checkLicense(actor.orgId);

    const agentGateway = await $findAgentGateway(agentGatewayId);
    const { permission } = await $getProjectPermission(agentGateway.projectId, actor);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentGatewayActions.ManageServices,
      ProjectPermissionSub.AgentGateways
    );

    const link = await agentGatewayServiceLinkDAL.findOne({ agentGatewayId, serviceId });
    if (!link) {
      throw new NotFoundError({
        message: `Proxied service with ID '${serviceId}' is not connected to this Agent Gateway`
      });
    }

    const service = await proxiedServiceDAL.findById(serviceId);
    await agentGatewayServiceLinkDAL.deleteById(link.id);

    return { agentGateway, service };
  };

  // Priority is the matcher's tie-break between services whose host patterns overlap, so reordering is a
  // real decision and the whole order is replaced at once rather than nudged one row at a time.
  const reorderProxiedServices = async (
    { agentGatewayId, serviceIds }: TReorderProxiedServicesDTO,
    actor: OrgServiceActor
  ) => {
    await $checkLicense(actor.orgId);

    const agentGateway = await $findAgentGateway(agentGatewayId);
    const { permission } = await $getProjectPermission(agentGateway.projectId, actor);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentGatewayActions.ManageServices,
      ProjectPermissionSub.AgentGateways
    );

    const links = await agentGatewayServiceLinkDAL.findByAgentGatewayId(agentGatewayId);
    const linkByServiceId = new Map(links.map((link) => [link.serviceId, link]));

    if (serviceIds.length !== links.length || serviceIds.some((id) => !linkByServiceId.has(id))) {
      throw new BadRequestError({
        message: "The provided service IDs must be exactly the services currently connected to this Agent Gateway"
      });
    }

    await agentGatewayServiceLinkDAL.transaction(async (tx) => {
      for await (const [index, serviceId] of serviceIds.entries()) {
        const link = linkByServiceId.get(serviceId);
        await agentGatewayServiceLinkDAL.updateById(link!.id, { priority: index }, tx);
      }
    });

    return { ...$toResponse(agentGateway), proxiedServices: await $withLinkedServices(agentGateway.id) };
  };

  return {
    create,
    list,
    getById,
    getByName,
    updateById,
    deleteById,
    linkProxiedService,
    unlinkProxiedService,
    reorderProxiedServices
  };
};
