import { ForbiddenError } from "@casl/ability";

import { AccessScope, ActionProjectType, RESOURCE_SCOPE, ResourceType } from "@app/db/schemas";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TGroupDALFactory } from "../group/group-dal";
import { TIdentityGroupMembershipDALFactory } from "../group/identity-group-membership-dal";
import { TUserGroupMembershipDALFactory } from "../group/user-group-membership-dal";
import { TLicenseServiceFactory } from "../license/license-service";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { ProjectPermissionAgentGatewayActions, ProjectPermissionSub } from "../permission/project-permission";
import { TAgentGatewayDALFactory } from "./agent-gateway-dal";
import { AgentGatewayPrincipalKind } from "./agent-gateway-enums";

export type TAgentGatewayAccessServiceFactory = ReturnType<typeof agentGatewayAccessServiceFactory>;

type TAgentGatewayAccessServiceFactoryDep = {
  agentGatewayDAL: Pick<TAgentGatewayDALFactory, "findByIdWithTransport">;
  membershipDAL: Pick<
    TMembershipDALFactory,
    "create" | "find" | "findOne" | "deleteById" | "findResourceMembershipsForActor" | "transaction"
  >;
  userDAL: Pick<TUserDALFactory, "find">;
  identityDAL: Pick<TIdentityDALFactory, "find">;
  groupDAL: Pick<TGroupDALFactory, "find">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">;
  identityGroupMembershipDAL: Pick<TIdentityGroupMembershipDALFactory, "find">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

type TPrincipalRef =
  | { kind: AgentGatewayPrincipalKind.User; principalId: string }
  | { kind: AgentGatewayPrincipalKind.Identity; principalId: string }
  | { kind: AgentGatewayPrincipalKind.Group; principalId: string };

export const agentGatewayAccessServiceFactory = ({
  agentGatewayDAL,
  membershipDAL,
  userDAL,
  identityDAL,
  groupDAL,
  userGroupMembershipDAL,
  identityGroupMembershipDAL,
  permissionService,
  licenseService
}: TAgentGatewayAccessServiceFactoryDep) => {
  const $checkLicense = async (orgId: string) => {
    const plan = await licenseService.getPlan(orgId);
    if (!plan.secretsBrokering) {
      throw new BadRequestError({
        message: "Failed to use secrets brokering due to plan restriction. Upgrade your plan to use agent gateways."
      });
    }
  };

  const $findAgentGateway = async (agentGatewayId: string) => {
    const agentGateway = await agentGatewayDAL.findByIdWithTransport(agentGatewayId);
    if (!agentGateway) {
      throw new NotFoundError({ message: `Agent Gateway with ID '${agentGatewayId}' not found` });
    }
    return agentGateway;
  };

  // Managing the list is gated on the project-level action, never on membership of the list itself.
  // Gating it on membership would make the capability self-expanding: anyone with access could grant it.
  const $assertCanManageAccess = async (projectId: string, actor: OrgServiceActor) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentGatewayActions.ManageAccess,
      ProjectPermissionSub.AgentGateways
    );
  };

  const $assertCanRead = async (projectId: string, actor: OrgServiceActor) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentGatewayActions.Read,
      ProjectPermissionSub.AgentGateways
    );
  };

  const $resourceFilter = (projectId: string, agentGatewayId: string) => ({
    scope: RESOURCE_SCOPE,
    scopeProjectId: projectId,
    scopeResourceType: ResourceType.AgentGateway,
    scopeResourceId: agentGatewayId
  });

  // Granting access to a principal who is not in the project yet would create a grant that silently does
  // nothing, so it is rejected with copy that says where to go first.
  const $assertPrincipalInProject = async (projectId: string, principal: TPrincipalRef) => {
    const projectMemberships = await membershipDAL.find({
      scope: AccessScope.Project,
      scopeProjectId: projectId
    });

    const projectGroupIds = new Set(
      projectMemberships.map((m) => m.actorGroupId).filter((id): id is string => Boolean(id))
    );

    if (principal.kind === AgentGatewayPrincipalKind.Group) {
      if (!projectGroupIds.has(principal.principalId)) {
        throw new BadRequestError({
          message:
            "This group can't be added here yet. Grant it access to the project under Access Control first, then grant it access to this Agent Gateway."
        });
      }
      return;
    }

    if (principal.kind === AgentGatewayPrincipalKind.User) {
      const direct = projectMemberships.some((m) => m.actorUserId === principal.principalId);
      if (direct) return;

      const viaGroup = projectGroupIds.size
        ? await userGroupMembershipDAL.find({
            userId: principal.principalId,
            $in: { groupId: [...projectGroupIds] }
          })
        : [];
      if (!viaGroup.length) {
        throw new BadRequestError({
          message:
            "This user can't be added here yet. Grant them access to the project under Access Control first, then grant them access to this Agent Gateway."
        });
      }
      return;
    }

    const direct = projectMemberships.some((m) => m.actorIdentityId === principal.principalId);
    if (direct) return;

    const viaGroup = projectGroupIds.size
      ? await identityGroupMembershipDAL.find({
          identityId: principal.principalId,
          $in: { groupId: [...projectGroupIds] }
        })
      : [];
    if (!viaGroup.length) {
      throw new BadRequestError({
        message:
          "This machine identity can't be added here yet. Grant it access to the project under Access Control first, then grant it access to this Agent Gateway."
      });
    }
  };

  const $actorColumn = (principal: TPrincipalRef) => {
    if (principal.kind === AgentGatewayPrincipalKind.User) return { actorUserId: principal.principalId };
    if (principal.kind === AgentGatewayPrincipalKind.Identity) return { actorIdentityId: principal.principalId };
    return { actorGroupId: principal.principalId };
  };

  const grantAccess = async (
    { agentGatewayId, ...principal }: { agentGatewayId: string } & TPrincipalRef,
    actor: OrgServiceActor
  ) => {
    await $checkLicense(actor.orgId);

    const agentGateway = await $findAgentGateway(agentGatewayId);
    await $assertCanManageAccess(agentGateway.projectId, actor);
    await $assertPrincipalInProject(agentGateway.projectId, principal);

    const filter = $resourceFilter(agentGateway.projectId, agentGatewayId);
    const existing = await membershipDAL.findOne({ ...filter, ...$actorColumn(principal) });
    if (existing) {
      throw new BadRequestError({ message: "This principal already has access to this Agent Gateway" });
    }

    // No membership_roles row is written. An agent gateway membership is intentionally roleless: presence
    // in the list is the entire grant, so a role would be a value nobody reads and everybody could
    // misread as meaningful.
    await membershipDAL.create({
      ...filter,
      scopeOrgId: actor.orgId,
      actorUserId: null,
      actorIdentityId: null,
      actorGroupId: null,
      ...$actorColumn(principal),
      isActive: true
    });

    return { agentGateway };
  };

  const revokeAccess = async (
    { agentGatewayId, ...principal }: { agentGatewayId: string } & TPrincipalRef,
    actor: OrgServiceActor
  ) => {
    await $checkLicense(actor.orgId);

    const agentGateway = await $findAgentGateway(agentGatewayId);
    await $assertCanManageAccess(agentGateway.projectId, actor);

    const filter = $resourceFilter(agentGateway.projectId, agentGatewayId);
    const membership = await membershipDAL.findOne({ ...filter, ...$actorColumn(principal) });
    if (!membership) {
      throw new NotFoundError({ message: "This principal does not have access to this Agent Gateway" });
    }

    await membershipDAL.deleteById(membership.id);
    return { agentGateway };
  };

  const listAccess = async ({ agentGatewayId }: { agentGatewayId: string }, actor: OrgServiceActor) => {
    await $checkLicense(actor.orgId);

    const agentGateway = await $findAgentGateway(agentGatewayId);
    await $assertCanRead(agentGateway.projectId, actor);

    const memberships = await membershipDAL.find($resourceFilter(agentGateway.projectId, agentGatewayId));

    const userIds = memberships.map((m) => m.actorUserId).filter((id): id is string => Boolean(id));
    const identityIds = memberships.map((m) => m.actorIdentityId).filter((id): id is string => Boolean(id));
    const groupIds = memberships.map((m) => m.actorGroupId).filter((id): id is string => Boolean(id));

    const [users, identities, groups] = await Promise.all([
      userIds.length ? userDAL.find({ $in: { id: userIds } }) : Promise.resolve([]),
      identityIds.length ? identityDAL.find({ $in: { id: identityIds } }) : Promise.resolve([]),
      groupIds.length ? groupDAL.find({ $in: { id: groupIds } }) : Promise.resolve([])
    ]);

    const userById = new Map(users.map((u) => [u.id, u]));
    const identityById = new Map(identities.map((i) => [i.id, i]));
    const groupById = new Map(groups.map((g) => [g.id, g]));

    return memberships.map((membership) => {
      if (membership.actorUserId) {
        const user = userById.get(membership.actorUserId);
        return {
          id: membership.id,
          kind: AgentGatewayPrincipalKind.User,
          principalId: membership.actorUserId,
          name: user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username : "",
          email: user?.email ?? null,
          createdAt: membership.createdAt
        };
      }

      if (membership.actorIdentityId) {
        const identity = identityById.get(membership.actorIdentityId);
        return {
          id: membership.id,
          kind: AgentGatewayPrincipalKind.Identity,
          principalId: membership.actorIdentityId,
          name: identity?.name ?? "",
          email: null,
          createdAt: membership.createdAt
        };
      }

      const group = groupById.get(membership.actorGroupId as string);
      return {
        id: membership.id,
        kind: AgentGatewayPrincipalKind.Group,
        principalId: membership.actorGroupId as string,
        name: group?.name ?? "",
        email: null,
        createdAt: membership.createdAt
      };
    });
  };

  // The runtime gate. Group expansion covers both users and machine identities, which is the whole reason
  // this rides on the shared memberships table rather than a bespoke one.
  const assertActorMayUse = async ({
    agentGatewayId,
    projectId,
    actor
  }: {
    agentGatewayId: string;
    projectId: string;
    actor: OrgServiceActor;
  }) => {
    if (actor.type !== ActorType.USER && actor.type !== ActorType.IDENTITY) {
      throw new ForbiddenRequestError({ message: "Only a user or a machine identity can use an Agent Gateway" });
    }

    const memberships = await membershipDAL.findResourceMembershipsForActor({
      projectId,
      resourceType: ResourceType.AgentGateway,
      resourceId: agentGatewayId,
      actorType: actor.type,
      actorId: actor.id
    });

    if (!memberships.length) {
      throw new ForbiddenRequestError({
        message: "You are not on the access list for this Agent Gateway. Ask a project admin to add you."
      });
    }
  };

  // Which agent gateways in this project the actor is on the access list for. Group grants are expanded for
  // users and machine identities alike, so a grant held only through a group counts.
  const listUsableAgentGatewayIds = async ({
    projectId,
    actor
  }: {
    projectId: string;
    actor: OrgServiceActor;
  }): Promise<string[]> => {
    if (actor.type !== ActorType.USER && actor.type !== ActorType.IDENTITY) return [];

    const memberships = await membershipDAL.findResourceMembershipsForActor({
      projectId,
      resourceType: ResourceType.AgentGateway,
      actorType: actor.type,
      actorId: actor.id
    });

    return memberships.map((membership) => membership.scopeResourceId).filter((id): id is string => Boolean(id));
  };

  return {
    grantAccess,
    revokeAccess,
    listAccess,
    assertActorMayUse,
    listUsableAgentGatewayIds
  };
};
