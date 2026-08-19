import { ForbiddenError } from "@casl/ability";

import { OrganizationActionScope } from "@app/db/schemas";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";

import { TLicenseServiceFactory } from "../license/license-service";
import { OrgPermissionAgentProxyActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { TResourceAuthMethodServiceFactory } from "../resource-auth-method/resource-auth-method-service";
import { TAgentProxyDALFactory } from "./agent-proxy-dal";

export type TAgentProxyServiceFactory = ReturnType<typeof agentProxyServiceFactory>;

type TActor = {
  type: ActorType;
  id: string;
  orgId: string;
  authMethod: ActorAuthMethod;
};

// Matches the gateway ceiling. Listing resolves revocability per row, so an unbounded count would
// turn the list endpoint into one query per proxy.
const MAX_AGENT_PROXIES_PER_ORG = 50;

export const agentProxyServiceFactory = ({
  agentProxyDAL,
  permissionService,
  resourceAuthMethodService,
  licenseService
}: {
  agentProxyDAL: TAgentProxyDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  resourceAuthMethodService: Pick<TResourceAuthMethodServiceFactory, "initAtCreate">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
}) => {
  const $checkLicense = async (orgId: string) => {
    const plan = await licenseService.getPlan(orgId);
    if (!plan.secretsBrokering) {
      throw new BadRequestError({
        message: "Failed to use secrets brokering due to plan restriction. Upgrade your plan to use agent proxies."
      });
    }
  };

  const $checkPermission = async (actor: TActor, action: OrgPermissionAgentProxyActions) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor: actor.type,
      actorId: actor.id,
      orgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(action, OrgPermissionSubjects.AgentProxy);
  };

  const createAgentProxy = async ({
    name,
    allowedHosts,
    actor
  }: {
    name: string;
    allowedHosts?: string[];
    actor: TActor;
  }) => {
    await $checkLicense(actor.orgId);
    await $checkPermission(actor, OrgPermissionAgentProxyActions.CreateAgentProxies);

    const existing = await agentProxyDAL.find({ orgId: actor.orgId }, { limit: MAX_AGENT_PROXIES_PER_ORG });
    if (existing.length >= MAX_AGENT_PROXIES_PER_ORG) {
      throw new BadRequestError({
        message: `You have reached the maximum of ${MAX_AGENT_PROXIES_PER_ORG} agent proxies for this organization. Delete an unused agent proxy before creating another.`
      });
    }

    try {
      return await agentProxyDAL.transaction(async (tx) => {
        const created = await agentProxyDAL.create({ name, orgId: actor.orgId, allowedHosts }, tx);
        // Token only: an agent proxy is always enrolled, never registered as a machine identity.
        await resourceAuthMethodService.initAtCreate(
          { resource: { type: "agentProxy", id: created.id }, authMethod: { method: "token" } },
          tx
        );
        return created;
      });
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation) {
        throw new BadRequestError({ message: `An agent proxy named "${name}" already exists` });
      }
      throw err;
    }
  };

  const updateAgentProxy = async ({
    agentProxyId,
    name,
    allowedHosts,
    actor
  }: {
    agentProxyId: string;
    name?: string;
    allowedHosts?: string[];
    actor: TActor;
  }) => {
    await $checkPermission(actor, OrgPermissionAgentProxyActions.EditAgentProxies);

    const agentProxy = await agentProxyDAL.findOne({ id: agentProxyId, orgId: actor.orgId });
    if (!agentProxy) {
      throw new NotFoundError({ message: `Agent proxy with ID "${agentProxyId}" not found` });
    }

    const update = {
      ...(name !== undefined ? { name } : {}),
      ...(allowedHosts !== undefined ? { allowedHosts } : {})
    };
    // Knex throws on an empty .update(), and a PATCH with no fields is a no-op, not an error.
    if (!Object.keys(update).length) return agentProxy;

    try {
      return await agentProxyDAL.updateById(agentProxyId, update);
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation) {
        throw new BadRequestError({ message: `An agent proxy named "${name}" already exists` });
      }
      throw err;
    }
  };

  const listAgentProxies = async ({ actor }: { actor: TActor }) => {
    await $checkPermission(actor, OrgPermissionAgentProxyActions.ListAgentProxies);
    return agentProxyDAL.find({ orgId: actor.orgId });
  };

  const getOrgAgentProxy = async ({ agentProxyId, actor }: { agentProxyId: string; actor: TActor }) => {
    await $checkPermission(actor, OrgPermissionAgentProxyActions.ListAgentProxies);

    const agentProxy = await agentProxyDAL.findOne({ id: agentProxyId, orgId: actor.orgId });
    if (!agentProxy) {
      throw new NotFoundError({ message: `Agent proxy with ID "${agentProxyId}" not found` });
    }
    return agentProxy;
  };

  const deleteAgentProxy = async ({ agentProxyId, actor }: { agentProxyId: string; actor: TActor }) => {
    await $checkPermission(actor, OrgPermissionAgentProxyActions.DeleteAgentProxies);

    const agentProxy = await agentProxyDAL.findOne({ id: agentProxyId, orgId: actor.orgId });
    if (!agentProxy) {
      throw new NotFoundError({ message: `Agent proxy with ID "${agentProxyId}" not found` });
    }

    return agentProxyDAL.deleteById(agentProxyId);
  };

  // Used by the auth plugin on every agent-proxy-authenticated request, so it takes no actor.
  const getAgentProxyById = async ({ agentProxyId }: { agentProxyId: string }) => {
    const agentProxy = await agentProxyDAL.findById(agentProxyId);
    if (!agentProxy) {
      throw new NotFoundError({ message: `Agent proxy with ID "${agentProxyId}" not found` });
    }
    return agentProxy;
  };

  const heartbeat = async ({ agentProxyId }: { agentProxyId: string }) => {
    await agentProxyDAL.updateById(agentProxyId, { heartbeat: new Date() });
  };

  return {
    createAgentProxy,
    updateAgentProxy,
    listAgentProxies,
    getOrgAgentProxy,
    deleteAgentProxy,
    getAgentProxyById,
    heartbeat
  };
};
