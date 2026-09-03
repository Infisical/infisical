import { Knex } from "knex";

import { AccessScope, ActionProjectType, ProjectMembershipRole } from "@app/db/schemas";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { AgentVaultIdentities } from "@app/services/license-client";
import { TUsageMeteringServiceFactory } from "@app/services/license-client/usage";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectAccessRequestDALFactory } from "@app/services/project/project-access-request-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";
import { TUserAliasDALFactory } from "@app/services/user-alias/user-alias-dal";
import { resolveUsersBySsoExternalId } from "@app/services/user-alias/user-alias-fns";

import { TAgentVaultActorContext } from "../agent-vault/agent-vault-actor-types";
import {
  AgentVaultMemberKind,
  TAgentVaultMembershipCleanupServiceFactory
} from "./agent-vault-membership-cleanup-service";

type TAgentVaultMembershipServiceFactoryDep = {
  membershipDAL: Pick<TMembershipDALFactory, "create" | "find" | "transaction" | "deleteById">;
  identityDAL: Pick<TIdentityDALFactory, "find">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "create" | "find" | "delete" | "update">;
  groupDAL: Pick<TGroupDALFactory, "find">;
  // Bundle grants live in our own join table, so a removal here has to reap them itself. The generic
  // membership service does it through the same cleanup for its own delete path.
  agentVaultMembershipCleanupService: Pick<
    TAgentVaultMembershipCleanupServiceFactory,
    "cleanupActorAgentVaultMemberships"
  >;
  projectAccessRequestDAL: Pick<TProjectAccessRequestDALFactory, "delete">;
  userDAL: Pick<TUserDALFactory, "find">;
  userAliasDAL: Pick<TUserAliasDALFactory, "findBySsoExternalIds">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
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

// Anything but admin resolves to the member set (§1.3), so these two are the only slugs worth writing.
const VALID_PRODUCT_ROLES: string[] = [ProjectMembershipRole.Admin, ProjectMembershipRole.Member];

// Mirrors PAM's product-membership service for the one path that bypasses Access Control: the signup
// invite, which grants the org's implicit Agent Vault project by email before the invitee has logged in.
export const agentVaultMembershipServiceFactory = ({
  membershipDAL,
  identityDAL,
  membershipRoleDAL,
  groupDAL,
  agentVaultMembershipCleanupService,
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

    // The invite this request accompanies resolves IdP identifiers through SSO aliases, so this half has
    // to as well, or it rejects a user the other half just added.
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
      const results: { membershipId: string; userId: string; role: string; createdAt: Date }[] = [];
      for (const { userId } of toCreate) {
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

  // The whole set rather than a page: the grant picker filters client-side, so a page would make
  // search unable to find an identity it never fetched. Mirrors PAM's product membership listing.
  const assertReadable = async (projectId: string, ctx: TAgentVaultActorContext) =>
    permissionService.getProjectPermission({
      actor: ctx.actor,
      actorId: ctx.actorId,
      projectId,
      actorAuthMethod: ctx.actorAuthMethod,
      actorOrgId: ctx.actorOrgId,
      actionProjectType: ActionProjectType.AgentVault
    });

  // Roles come back in one query rather than one per membership: the pool is small and this list is
  // rendered on every visit to Access Control.
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

  /** Identity members with their name attached, so the page never joins against the org identity list. */
  const listProductIdentityMembers = async ({ projectId, ctx }: TListAgentVaultProductIdentitiesDTO) => {
    await assertReadable(projectId, ctx);

    const memberships = await membershipDAL.find({ scope: AccessScope.Project, scopeProjectId: projectId });
    const identityMemberships = memberships.filter((m) => m.actorIdentityId);
    const resolved = await resolveMemberships(identityMemberships);

    const identityIds = resolved.map((m) => m.identityId).filter((v): v is string => Boolean(v));
    const identities = identityIds.length ? await identityDAL.find({ $in: { id: identityIds } }) : [];
    const nameById = new Map(identities.map((i) => [i.id, i.name]));

    return resolved.map((m) => ({ ...m, name: (m.identityId && nameById.get(m.identityId)) || "" }));
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

  // The last admin cannot be demoted or removed, or the product becomes unadministrable and only a
  // server admin could put it right.
  const assertNotLastAdmin = async (projectId: string, membershipId: string, tx: Knex) => {
    const memberships = await membershipDAL.find({ scope: AccessScope.Project, scopeProjectId: projectId }, { tx });
    const roles = await membershipRoleDAL.find({ $in: { membershipId: memberships.map((m) => m.id) } }, { tx });
    const admins = roles.filter((r) => r.role === ProjectMembershipRole.Admin);

    if (admins.length <= 1 && admins.some((r) => r.membershipId === membershipId)) {
      throw new BadRequestError({ message: "Agent Vault must keep at least one admin" });
    }
  };

  const addProductMember = async ({ projectId, role, ctx, ...dto }: TAddAgentVaultProductMemberDTO) => {
    await checkProductAdmin(projectId, ctx);
    assertValidRole(role);

    const { column, id, label } = resolveActorColumn(dto);

    if (dto.groupId) {
      const [group] = await groupDAL.find({ id: dto.groupId, orgId: ctx.actorOrgId });
      if (!group) throw new NotFoundError({ message: `Group with ID '${dto.groupId}' not found` });
    }
    if (dto.identityId) {
      const [identity] = await identityDAL.find({ id: dto.identityId, orgId: ctx.actorOrgId });
      if (!identity) throw new NotFoundError({ message: `Machine identity with ID '${dto.identityId}' not found` });
    }

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
    return result;
  };

  const updateProductMemberRole = async ({ projectId, role, ctx, ...dto }: TUpdateAgentVaultProductMemberDTO) => {
    await checkProductAdmin(projectId, ctx);
    assertValidRole(role);

    const { column, id, label } = resolveActorColumn(dto);

    return membershipDAL.transaction(async (tx) => {
      const [membership] = await membershipDAL.find(
        { scope: AccessScope.Project, scopeProjectId: projectId, [column]: id },
        { tx }
      );
      if (!membership) throw new NotFoundError({ message: `${label} does not have access to Agent Vault` });

      if (role !== ProjectMembershipRole.Admin) await assertNotLastAdmin(projectId, membership.id, tx);

      await membershipRoleDAL.delete({ membershipId: membership.id }, tx);
      const membershipRole = await membershipRoleDAL.create({ membershipId: membership.id, role }, tx);

      return { membershipId: membership.id, ...dto, role: membershipRole.role };
    });
  };

  const removeProductMember = async ({ projectId, ctx, ...dto }: TRemoveAgentVaultProductMemberDTO) => {
    await checkProductAdmin(projectId, ctx);

    if ((dto.userId && dto.userId === ctx.actorId) || (dto.identityId && dto.identityId === ctx.actorId)) {
      throw new ForbiddenRequestError({ message: "You cannot remove your own access" });
    }

    const { column, id, label } = resolveActorColumn(dto);

    let actorKind = AgentVaultMemberKind.Identity;
    if (dto.userId) actorKind = AgentVaultMemberKind.User;
    else if (dto.groupId) actorKind = AgentVaultMemberKind.Group;

    await membershipDAL.transaction(async (tx) => {
      const [membership] = await membershipDAL.find(
        { scope: AccessScope.Project, scopeProjectId: projectId, [column]: id },
        { tx }
      );
      if (!membership) throw new NotFoundError({ message: `${label} does not have access to Agent Vault` });

      await assertNotLastAdmin(projectId, membership.id, tx);

      // Losing the product means losing every bundle grant. Skipping this would leave rows the mint
      // path still honours, because they live outside the membership table the generic reaper walks.
      await agentVaultMembershipCleanupService.cleanupActorAgentVaultMemberships(
        { projectId, actorKind, actorId: id },
        tx
      );

      await membershipRoleDAL.delete({ membershipId: membership.id }, tx);
      await membershipDAL.deleteById(membership.id, tx);
    });

    usageMeteringService.emitForProject(projectId, AgentVaultIdentities.key);
    return { ...dto };
  };

  const listProductIdentities = async ({ projectId, ctx }: TListAgentVaultProductIdentitiesDTO) => {
    await permissionService.getProjectPermission({
      actor: ctx.actor,
      actorId: ctx.actorId,
      projectId,
      actorAuthMethod: ctx.actorAuthMethod,
      actorOrgId: ctx.actorOrgId,
      actionProjectType: ActionProjectType.AgentVault
    });

    const memberships = await membershipDAL.find({ scope: AccessScope.Project, scopeProjectId: projectId });
    const identityIds = memberships.map((m) => m.actorIdentityId).filter((id): id is string => Boolean(id));
    if (!identityIds.length) return [];

    const identities = await identityDAL.find({ $in: { id: identityIds } });
    return identities
      .map((identity) => ({ id: identity.id, name: identity.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  return {
    addProductUserMembers,
    listProductIdentities,
    listProductIdentityMembers,
    addProductMember,
    updateProductMemberRole,
    removeProductMember
  };
};
