import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import { AccessScope, ActionProjectType, ProjectMembershipRole, RESOURCE_SCOPE } from "@app/db/schemas";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionIdentityActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { AgentVaultIdentities } from "@app/services/license-client";
import { TUsageMeteringServiceFactory } from "@app/services/license-client/usage";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { assertWillRetainProjectAdmin } from "@app/services/membership/membership-fns";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectAccessRequestDALFactory } from "@app/services/project/project-access-request-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";
import { TUserAliasDALFactory } from "@app/services/user-alias/user-alias-dal";
import { resolveUsersBySsoExternalId } from "@app/services/user-alias/user-alias-fns";

import { TAgentVaultActorContext } from "../agent-vault/agent-vault-actor-types";

type TAgentVaultMembershipServiceFactoryDep = {
  membershipDAL: Pick<TMembershipDALFactory, "create" | "find" | "transaction" | "delete" | "deleteById">;
  identityDAL: Pick<TIdentityDALFactory, "find">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "create" | "find" | "delete" | "update">;
  groupDAL: Pick<TGroupDALFactory, "find">;
  projectAccessRequestDAL: Pick<TProjectAccessRequestDALFactory, "delete">;
  userDAL: Pick<TUserDALFactory, "find">;
  userAliasDAL: Pick<TUserAliasDALFactory, "findBySsoExternalIds">;
  orgDAL: Pick<TOrgDALFactory, "findById" | "findEffectiveOrgMembership">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  usageMeteringService: Pick<TUsageMeteringServiceFactory, "emitForProject">;
};

export type TAgentVaultMembershipServiceFactory = ReturnType<typeof agentVaultMembershipServiceFactory>;

export type TListAgentVaultProductIdentitiesDTO = {
  projectId: string;
  ctx: TAgentVaultActorContext;
};

type TAgentVaultProductActor = {
  userId?: string;
  groupId?: string;
  identityId?: string;
};

export type TAddAgentVaultProductMemberDTO = TAgentVaultProductActor & {
  projectId: string;
  role: string;
  ctx: TAgentVaultActorContext;
};

export type TUpdateAgentVaultProductMemberDTO = TAddAgentVaultProductMemberDTO;

export type TRemoveAgentVaultProductMemberDTO = TAgentVaultProductActor & {
  projectId: string;
  ctx: TAgentVaultActorContext;
};

export type TAddAgentVaultProductUserMembersDTO = {
  projectId: string;
  userIds: string[];
  emails: string[];
  role: ProjectMembershipRole.Admin | ProjectMembershipRole.Member;
  ctx: TAgentVaultActorContext;
};

const VALID_PRODUCT_ROLES: string[] = [ProjectMembershipRole.Admin, ProjectMembershipRole.Member];

export const agentVaultMembershipServiceFactory = ({
  membershipDAL,
  identityDAL,
  membershipRoleDAL,
  groupDAL,
  projectAccessRequestDAL,
  userDAL,
  userAliasDAL,
  orgDAL,
  permissionService,
  usageMeteringService
}: TAgentVaultMembershipServiceFactoryDep) => {
  const checkProductAdmin = async (projectId: string, ctx: TAgentVaultActorContext) => {
    const { hasRole } = await permissionService.getProjectPermission({
      actor: ctx.actor,
      actorId: ctx.actorId,
      projectId,
      actorAuthMethod: ctx.actorAuthMethod,
      actorOrgId: ctx.actorOrgId,
      actionProjectType: ActionProjectType.AgentVault
    });
    if (!hasRole(ProjectMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only Agent Vault admins can perform this action" });
    }
  };

  const addProductUserMembers = async ({
    projectId,
    userIds,
    emails,
    role,
    ctx
  }: TAddAgentVaultProductUserMembersDTO) => {
    await checkProductAdmin(projectId, ctx);

    if (!VALID_PRODUCT_ROLES.includes(role)) {
      throw new BadRequestError({
        message: `Invalid product role '${role}'. Expected: ${VALID_PRODUCT_ROLES.join(", ")}`
      });
    }

    const usersByEmail = emails.length ? await userDAL.find({ $in: { username: emails } }) : [];
    const userByEmail = new Map(usersByEmail.map((u) => [u.username, u]));

    // The invite this accompanies resolves IdP identifiers through SSO aliases, so this half has to as well.
    const unmatched = emails.filter((e) => !userByEmail.has(e));
    if (unmatched.length) {
      const org = await orgDAL.findById(ctx.actorOrgId);
      const { resolved, ambiguousIdentifiers } = await resolveUsersBySsoExternalId({
        identifiers: unmatched,
        orgId: ctx.actorOrgId,
        rootOrgId: org?.rootOrgId,
        userAliasDAL,
        userDAL
      });

      if (ambiguousIdentifiers.length) {
        throw new BadRequestError({
          message: `Identifier(s) ${ambiguousIdentifiers
            .map((el) => `'${el}'`)
            .join(
              ", "
            )} match more than one SSO account in this organization. Use the user's email address instead, or contact support to resolve the duplicate.`
        });
      }

      resolved.forEach((user, identifier) => userByEmail.set(identifier, user));
    }

    const unresolved = emails.filter((e) => !userByEmail.has(e));

    const candidates: { userId: string; label: string }[] = [];
    const seen = new Set<string>();
    for (const id of userIds) {
      if (!seen.has(id)) {
        seen.add(id);
        candidates.push({ userId: id, label: id });
      }
    }
    for (const email of emails) {
      const user = userByEmail.get(email);
      if (user && !seen.has(user.id)) {
        seen.add(user.id);
        candidates.push({ userId: user.id, label: email });
      }
    }

    const existing = await membershipDAL.find({ scope: AccessScope.Project, scopeProjectId: projectId });
    const alreadyAttached = new Set(existing.map((m) => m.actorUserId).filter((v): v is string => Boolean(v)));
    const skipped: string[] = [];

    const orgMemberships = candidates.length
      ? await membershipDAL.find({
          scope: AccessScope.Organization,
          scopeOrgId: ctx.actorOrgId,
          isActive: true,
          $in: { actorUserId: candidates.map((c) => c.userId) }
        })
      : [];
    const orgMemberIds = new Set(orgMemberships.map((m) => m.actorUserId));

    const toCreate = candidates.filter((c) => {
      if (!orgMemberIds.has(c.userId)) {
        unresolved.push(c.label);
        return false;
      }
      if (alreadyAttached.has(c.userId)) {
        skipped.push(c.label);
        return false;
      }
      return true;
    });

    if (unresolved.length) {
      const rejected = unresolved.map((el) => `'${el}'`).join(", ");
      throw new BadRequestError({
        message: `Cannot add ${rejected} to Agent Vault because they are not an active member of this organization. Invite them to the organization first.`
      });
    }

    const memberships = await membershipDAL.transaction(async (tx) => {
      const results: { membershipId: string; userId: string; userName?: string; role: string; createdAt: Date }[] = [];
      for (const { userId, label } of toCreate) {
        // eslint-disable-next-line no-await-in-loop
        const membership = await membershipDAL.create(
          {
            scope: AccessScope.Project,
            scopeOrgId: ctx.actorOrgId,
            scopeProjectId: projectId,
            actorUserId: userId,
            isActive: true
          },
          tx
        );
        // eslint-disable-next-line no-await-in-loop
        const membershipRole = await membershipRoleDAL.create({ membershipId: membership.id, role }, tx);
        // eslint-disable-next-line no-await-in-loop
        await projectAccessRequestDAL.delete({ projectId, requesterUserId: userId }, tx);
        results.push({
          userName: label.includes("@") ? label : undefined,
          membershipId: membership.id,
          userId,
          role: membershipRole.role,
          createdAt: membership.createdAt
        });
      }
      return results;
    });

    if (memberships.length > 0) {
      usageMeteringService.emitForProject(projectId, AgentVaultIdentities.key);
    }

    return { memberships, skipped };
  };

  const assertCanReadIdentities = async (projectId: string, ctx: TAgentVaultActorContext) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: ctx.actor,
      actorId: ctx.actorId,
      projectId,
      actorAuthMethod: ctx.actorAuthMethod,
      actorOrgId: ctx.actorOrgId,
      actionProjectType: ActionProjectType.AgentVault
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityActions.Read,
      ProjectPermissionSub.Identity
    );
  };

  const resolveMemberships = async (memberships: Awaited<ReturnType<typeof membershipDAL.find>>) => {
    if (!memberships.length) return [];

    const roles = await membershipRoleDAL.find({ $in: { membershipId: memberships.map((m) => m.id) } });
    const roleByMembership = new Map(roles.map((r) => [r.membershipId, r]));

    return memberships.map((m) => {
      const role = roleByMembership.get(m.id);
      return {
        membershipId: m.id,
        userId: m.actorUserId ?? null,
        identityId: m.actorIdentityId ?? null,
        groupId: m.actorGroupId ?? null,
        role: role?.role ?? ProjectMembershipRole.Member,
        isActive: m.isActive,
        createdAt: m.createdAt
      };
    });
  };

  const listProductIdentityMembers = async ({ projectId, ctx }: TListAgentVaultProductIdentitiesDTO) => {
    await assertCanReadIdentities(projectId, ctx);

    const memberships = await membershipDAL.find({ scope: AccessScope.Project, scopeProjectId: projectId });
    const identityMemberships = memberships.filter((m) => m.actorIdentityId);
    const resolved = await resolveMemberships(identityMemberships);

    const identityIds = resolved.map((m) => m.identityId).filter((v): v is string => Boolean(v));
    const identities = identityIds.length ? await identityDAL.find({ $in: { id: identityIds } }) : [];
    const identityById = new Map(identities.map((i) => [i.id, i]));

    return resolved.map((m) => {
      const identity = m.identityId ? identityById.get(m.identityId) : undefined;
      return {
        ...m,
        name: identity?.name ?? "",
        identityProjectId: identity?.projectId ?? null,
        identityOrgId: identity?.orgId ?? null
      };
    });
  };

  const resolveActorColumn = (dto: { userId?: string; groupId?: string; identityId?: string }) => {
    if (dto.userId) return { column: "actorUserId" as const, id: dto.userId, label: "User" };
    if (dto.groupId) return { column: "actorGroupId" as const, id: dto.groupId, label: "Group" };
    if (dto.identityId) return { column: "actorIdentityId" as const, id: dto.identityId, label: "Machine identity" };
    throw new BadRequestError({ message: "Name exactly one user, group or machine identity" });
  };

  const assertValidRole = (role: string) => {
    if (!VALID_PRODUCT_ROLES.includes(role)) {
      throw new BadRequestError({
        message: `Invalid product role '${role}'. Expected: ${VALID_PRODUCT_ROLES.join(", ")}`
      });
    }
  };

  // resolveSession refuses an actor without an active org membership, so a member added without one could never mint.
  const assertActorIsInOrg = async (
    dto: { userId?: string; groupId?: string; identityId?: string },
    orgId: string,
    projectId: string,
    label: string
  ) => {
    if (dto.groupId) {
      const [group] = await groupDAL.find({ id: dto.groupId, orgId });
      if (!group) throw new NotFoundError({ message: `Group with ID '${dto.groupId}' not found` });
      return;
    }
    if (dto.identityId) {
      const [identity] = await identityDAL.find({ id: dto.identityId, orgId });
      if (!identity) throw new NotFoundError({ message: `Machine identity with ID '${dto.identityId}' not found` });
      // An identity created inside another product still carries an org-scope NoAccess membership, so the
      // org check below passes for it. Only Agent Vault's own identities and unscoped org ones belong here.
      if (identity.projectId && identity.projectId !== projectId) {
        throw new BadRequestError({
          message: `Machine identity with ID '${dto.identityId}' belongs to another project and cannot be given Agent Vault access`
        });
      }
    }

    const actorId = dto.userId ?? dto.identityId!;
    // Status is not required: an org invite that has not been accepted still gets project access
    // everywhere else on the platform, and resolveSession refuses the actor until it is. isActive is the
    // real gate, so a deactivated member is still refused.
    const membership = await orgDAL.findEffectiveOrgMembership({
      actorType: dto.userId ? ActorType.USER : ActorType.IDENTITY,
      actorId,
      orgId,
      acceptAnyStatus: true
    });
    if (!membership?.isActive) {
      throw new BadRequestError({
        message: `Cannot add ${label.toLowerCase()} '${actorId}' to Agent Vault because they are not an active member of this organization. Invite them to the organization first.`
      });
    }
  };

  const resolveActorLabel = async (dto: { userId?: string; groupId?: string; identityId?: string }) => {
    if (dto.groupId) {
      const [group] = await groupDAL.find({ id: dto.groupId });
      return { groupName: group?.name };
    }
    if (dto.identityId) {
      const [identity] = await identityDAL.find({ id: dto.identityId });
      return { identityName: identity?.name };
    }
    const [user] = dto.userId ? await userDAL.find({ id: dto.userId }) : [];
    return { userName: user?.username };
  };

  const addProductMember = async ({ projectId, role, ctx, ...dto }: TAddAgentVaultProductMemberDTO) => {
    await checkProductAdmin(projectId, ctx);
    assertValidRole(role);

    const { column, id, label } = resolveActorColumn(dto);
    await assertActorIsInOrg(dto, ctx.actorOrgId, projectId, label);

    const result = await membershipDAL.transaction(async (tx) => {
      const existing = await membershipDAL.find(
        { scope: AccessScope.Project, scopeProjectId: projectId, [column]: id },
        { tx }
      );
      if (existing.length) {
        throw new BadRequestError({ message: `${label} already has access to Agent Vault` });
      }

      const membership = await membershipDAL.create(
        {
          scope: AccessScope.Project,
          scopeOrgId: ctx.actorOrgId,
          scopeProjectId: projectId,
          [column]: id,
          isActive: true
        },
        tx
      );
      const membershipRole = await membershipRoleDAL.create({ membershipId: membership.id, role }, tx);

      if (dto.userId) await projectAccessRequestDAL.delete({ projectId, requesterUserId: dto.userId }, tx);

      return { membershipId: membership.id, ...dto, role: membershipRole.role, createdAt: membership.createdAt };
    });

    usageMeteringService.emitForProject(projectId, AgentVaultIdentities.key);
    return { ...result, ...(await resolveActorLabel(dto)) };
  };

  const updateProductMemberRole = async ({ projectId, role, ctx, ...dto }: TUpdateAgentVaultProductMemberDTO) => {
    await checkProductAdmin(projectId, ctx);
    assertValidRole(role);

    if ((dto.userId && dto.userId === ctx.actorId) || (dto.identityId && dto.identityId === ctx.actorId)) {
      throw new ForbiddenRequestError({ message: "You cannot change your own role" });
    }

    const { column, id, label } = resolveActorColumn(dto);
    // The add paths check this; promoting did not, so a deactivated member could still be made an admin.
    await assertActorIsInOrg(dto, ctx.actorOrgId, projectId, label);

    const updated = await membershipDAL.transaction(async (tx) => {
      const [membership] = await membershipDAL.find(
        { scope: AccessScope.Project, scopeProjectId: projectId, [column]: id },
        { tx }
      );
      if (!membership) throw new NotFoundError({ message: `${label} does not have access to Agent Vault` });

      if (role !== ProjectMembershipRole.Admin) {
        await assertWillRetainProjectAdmin({
          scopeProjectId: projectId,
          excludeMembershipIds: [membership.id],
          productLabel: "Agent Vault",
          tx
        });
      }

      await membershipRoleDAL.delete({ membershipId: membership.id }, tx);
      const membershipRole = await membershipRoleDAL.create({ membershipId: membership.id, role }, tx);

      return { membershipId: membership.id, ...dto, role: membershipRole.role };
    });

    return { ...updated, ...(await resolveActorLabel(dto)) };
  };

  const removeProductMember = async ({ projectId, ctx, ...dto }: TRemoveAgentVaultProductMemberDTO) => {
    await checkProductAdmin(projectId, ctx);

    if ((dto.userId && dto.userId === ctx.actorId) || (dto.identityId && dto.identityId === ctx.actorId)) {
      throw new ForbiddenRequestError({ message: "You cannot remove your own access" });
    }

    const { column, id, label } = resolveActorColumn(dto);

    // An identity scoped to this project exists only to be an Agent Vault member. Detaching it would leave
    // a live identity no screen can reach: this tab lists by membership, and the org list hides scoped ones.
    if (dto.identityId) {
      const [identity] = await identityDAL.find({ id: dto.identityId });
      if (identity?.projectId === projectId) {
        throw new BadRequestError({
          message: `Machine identity with ID '${dto.identityId}' is managed by Agent Vault. Delete the identity instead of removing its access`
        });
      }
    }

    const membershipId = await membershipDAL.transaction(async (tx) => {
      const [membership] = await membershipDAL.find(
        { scope: AccessScope.Project, scopeProjectId: projectId, [column]: id },
        { tx }
      );
      if (!membership) throw new NotFoundError({ message: `${label} does not have access to Agent Vault` });

      await assertWillRetainProjectAdmin({
        scopeProjectId: projectId,
        excludeMembershipIds: [membership.id],
        productLabel: "Agent Vault",
        tx
      });

      await membershipDAL.delete({ scope: RESOURCE_SCOPE, scopeProjectId: projectId, [column]: id }, tx);

      await membershipRoleDAL.delete({ membershipId: membership.id }, tx);
      await membershipDAL.deleteById(membership.id, tx);

      return membership.id;
    });

    usageMeteringService.emitForProject(projectId, AgentVaultIdentities.key);
    return { membershipId, ...dto, ...(await resolveActorLabel(dto)) };
  };

  return {
    addProductUserMembers,
    listProductIdentityMembers,
    addProductMember,
    updateProductMemberRole,
    removeProductMember
  };
};
