import { ForbiddenError } from "@casl/ability";

import { AccessScope, RESOURCE_SCOPE, ResourceMembershipRole, ResourceType } from "@app/db/schemas";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { TIdentityGroupMembershipDALFactory } from "@app/ee/services/group/identity-group-membership-dal";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ResourcePermissionSignerActions,
  ResourcePermissionSub
} from "@app/ee/services/permission/resource-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { TApprovalPolicyDALFactory } from "../approval-policy/approval-policy-dal";
import { ApprovalPolicyScope } from "../approval-policy/approval-policy-enums";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TMembershipDALFactory } from "../membership/membership-dal";
import { TMembershipRoleDALFactory } from "../membership/membership-role-dal";
import { TSignerDALFactory } from "../signer/signer-dal";
import { TUserDALFactory } from "../user/user-dal";
import {
  EffectiveSignerMemberKind,
  SignerMemberKind,
  TAddSignerMemberDTO,
  TAddSignerUserMembersDTO,
  TEffectiveSignerMember,
  TListEffectiveSignerMembersDTO,
  TListSignerMembersDTO,
  TRemoveSignerMemberDTO,
  TSignerMember,
  TSignerMemberKind,
  TUpdateSignerMemberRoleDTO
} from "./signer-membership-types";

type TSignerMembershipServiceFactoryDep = {
  signerDAL: Pick<TSignerDALFactory, "findById" | "find">;
  membershipDAL: Pick<TMembershipDALFactory, "create" | "findById" | "find" | "deleteById" | "transaction">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "create" | "find" | "delete" | "update">;
  permissionService: Pick<TPermissionServiceFactory, "getResourcePermission">;
  userDAL: Pick<TUserDALFactory, "find">;
  identityDAL: Pick<TIdentityDALFactory, "find">;
  groupDAL: Pick<TGroupDALFactory, "find">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">;
  identityGroupMembershipDAL: Pick<TIdentityGroupMembershipDALFactory, "find">;
  approvalPolicyDAL: Pick<TApprovalPolicyDALFactory, "deleteStepApproversBySubject">;
};

export type TSignerMembershipServiceFactory = ReturnType<typeof signerMembershipServiceFactory>;

export const BUILTIN_SIGNER_ROLES = Object.values(ResourceMembershipRole).filter(
  (r) => r !== ResourceMembershipRole.Custom
);

export const isBuiltInSignerRole = (role: string): role is ResourceMembershipRole =>
  (BUILTIN_SIGNER_ROLES as string[]).includes(role);

export const unknownSignerRoleMessage = (role: string) =>
  `Unknown signer role '${role}'. Expected one of: ${BUILTIN_SIGNER_ROLES.join(", ")}.`;

const BUILTIN_ROLE_RANK: Record<string, number> = {
  [ResourceMembershipRole.Admin]: 3,
  [ResourceMembershipRole.Operator]: 2,
  [ResourceMembershipRole.Auditor]: 1
};

const pickGroupRoleForDisplay = (a: string, b: string): string => {
  const aRank = BUILTIN_ROLE_RANK[a];
  const bRank = BUILTIN_ROLE_RANK[b];
  if (aRank !== undefined && bRank !== undefined) return bRank > aRank ? b : a;
  if (aRank !== undefined) return a;
  if (bRank !== undefined) return b;
  return a < b ? a : b;
};

export const signerMembershipServiceFactory = ({
  signerDAL,
  membershipDAL,
  membershipRoleDAL,
  permissionService,
  userDAL,
  identityDAL,
  groupDAL,
  userGroupMembershipDAL,
  identityGroupMembershipDAL,
  approvalPolicyDAL
}: TSignerMembershipServiceFactoryDep) => {
  const $loadSignerOrThrow = async (signerId: string, projectId: string) => {
    const signer = await signerDAL.findById(signerId);
    if (!signer || signer.projectId !== projectId) {
      throw new NotFoundError({ message: `Signer with id '${signerId}' not found.` });
    }
    return signer;
  };

  const $buildMemberDetails = async (member: {
    actorUserId?: string | null;
    actorIdentityId?: string | null;
    actorGroupId?: string | null;
  }): Promise<TSignerMember["details"]> => {
    if (member.actorUserId) {
      const [u] = await userDAL.find({ $in: { id: [member.actorUserId] } });
      if (!u) return null;
      const fullName = [u.firstName, u.lastName].filter((p): p is string => Boolean(p?.trim())).join(" ") || null;
      return { name: fullName, email: u.email ?? null, username: u.username ?? null };
    }
    if (member.actorIdentityId) {
      const [i] = await identityDAL.find({ $in: { id: [member.actorIdentityId] } });
      if (!i) return null;
      return { name: i.name, authMethod: i.authMethod ?? null };
    }
    if (member.actorGroupId) {
      const [g] = await groupDAL.find({ $in: { id: [member.actorGroupId] } });
      if (!g) return null;
      return { name: g.name, slug: g.slug };
    }
    return null;
  };

  const $assertActorPresentInOrg = async (
    orgId: string,
    actor: { userId?: string; identityId?: string; groupId?: string }
  ) => {
    const setActors = [actor.userId, actor.identityId, actor.groupId].filter(Boolean);
    if (setActors.length !== 1) {
      throw new BadRequestError({
        message: "Exactly one of userId, identityId, or groupId must be provided."
      });
    }

    const where: Record<string, unknown> = {
      scope: AccessScope.Organization,
      scopeOrgId: orgId
    };
    if (actor.userId) where.actorUserId = actor.userId;
    else if (actor.identityId) where.actorIdentityId = actor.identityId;
    else if (actor.groupId) where.actorGroupId = actor.groupId;

    const orgMembership = await membershipDAL.find(where);
    if (!orgMembership.length) {
      throw new BadRequestError({
        message: "The actor is not a member of this organization. Invite them to the organization first."
      });
    }
    return orgMembership[0];
  };

  const $loadResourcePermission = (
    signerId: string,
    projectId: string,
    ctx: {
      actor: TAddSignerMemberDTO["actor"];
      actorId: string;
      actorAuthMethod: TAddSignerMemberDTO["actorAuthMethod"];
      actorOrgId?: string;
    }
  ) =>
    permissionService.getResourcePermission({
      actor: ctx.actor,
      actorId: ctx.actorId,
      projectId,
      resourceType: ResourceType.Signer,
      resourceId: signerId,
      actorAuthMethod: ctx.actorAuthMethod,
      actorOrgId: ctx.actorOrgId
    });

  const addMember = async ({
    signerId,
    userId,
    identityId,
    groupId,
    role,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TAddSignerMemberDTO): Promise<TSignerMember> => {
    const signer = await $loadSignerOrThrow(signerId, projectId);

    const { permission } = await $loadResourcePermission(signerId, projectId, {
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionSignerActions.ManageMembers,
      ResourcePermissionSub.Signer
    );

    if (!isBuiltInSignerRole(role)) {
      throw new BadRequestError({ message: unknownSignerRoleMessage(role) });
    }

    const orgMembership = await $assertActorPresentInOrg(actorOrgId, { userId, identityId, groupId });

    const membership = await membershipDAL.transaction(async (tx) => {
      const existingSignerMembershipFilter: Record<string, unknown> = {
        scope: RESOURCE_SCOPE,
        scopeProjectId: projectId,
        scopeResourceType: ResourceType.Signer,
        scopeResourceId: signerId
      };
      if (userId) existingSignerMembershipFilter.actorUserId = userId;
      else if (identityId) existingSignerMembershipFilter.actorIdentityId = identityId;
      else if (groupId) existingSignerMembershipFilter.actorGroupId = groupId;
      const existingSignerMembership = await membershipDAL.find(existingSignerMembershipFilter, { tx });
      if (existingSignerMembership.length > 0) {
        // eslint-disable-next-line no-nested-ternary
        const subjectLabel = userId ? "user" : identityId ? "identity" : "group";
        throw new BadRequestError({
          message: `This ${subjectLabel} is already a member of this Signer.`
        });
      }

      const projectMembershipFilter: Record<string, unknown> = {
        scope: AccessScope.Project,
        scopeProjectId: projectId
      };
      if (userId) projectMembershipFilter.actorUserId = userId;
      else if (identityId) projectMembershipFilter.actorIdentityId = identityId;
      else if (groupId) projectMembershipFilter.actorGroupId = groupId;
      const existingProjectMembership = await membershipDAL.find(projectMembershipFilter, { tx });

      if (existingProjectMembership.length === 0) {
        // eslint-disable-next-line no-nested-ternary
        const subjectLabel = userId ? "user" : identityId ? "machine identity" : "group";
        throw new BadRequestError({
          message: `This ${subjectLabel} can't be added here yet. Grant them access under Access Control first, then assign them to the signer.`
        });
      }

      const newMembership = await membershipDAL.create(
        {
          scope: RESOURCE_SCOPE,
          scopeOrgId: orgMembership.scopeOrgId,
          scopeProjectId: projectId,
          actorUserId: userId ?? null,
          actorIdentityId: identityId ?? null,
          actorGroupId: groupId ?? null,
          scopeResourceType: ResourceType.Signer,
          scopeResourceId: signerId,
          isActive: true
        },
        tx
      );

      const newRole = await membershipRoleDAL.create(
        {
          membershipId: newMembership.id,
          role
        },
        tx
      );

      return {
        membershipId: newMembership.id,
        signerId,
        actorUserId: newMembership.actorUserId ?? null,
        actorIdentityId: newMembership.actorIdentityId ?? null,
        actorGroupId: newMembership.actorGroupId ?? null,
        role: newRole.role,
        customRoleId: newRole.customRoleId ?? null,
        createdAt: newMembership.createdAt,
        updatedAt: newMembership.updatedAt
      };
    });

    const details = await $buildMemberDetails(membership);
    return { ...membership, signerName: signer.name, details };
  };

  const listMembers = async ({
    signerId,
    kind,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TListSignerMembersDTO): Promise<TSignerMember[]> => {
    await $loadSignerOrThrow(signerId, projectId);

    const { permission } = await $loadResourcePermission(signerId, projectId, {
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(ResourcePermissionSignerActions.Read, ResourcePermissionSub.Signer);

    const memberships = await membershipDAL.find({
      scope: RESOURCE_SCOPE,
      scopeProjectId: projectId,
      scopeResourceType: ResourceType.Signer,
      scopeResourceId: signerId
    });

    const filteredMemberships = kind
      ? memberships.filter((m) => {
          if (kind === SignerMemberKind.User) return Boolean(m.actorUserId);
          if (kind === SignerMemberKind.Identity) return Boolean(m.actorIdentityId);
          return Boolean(m.actorGroupId);
        })
      : memberships;

    if (filteredMemberships.length === 0) return [];

    const roles = await membershipRoleDAL.find({
      $in: { membershipId: filteredMemberships.map((m) => m.id) }
    });
    const rolesByMembership = new Map<string, (typeof roles)[number]>();
    for (const r of roles) rolesByMembership.set(r.membershipId, r);

    const userIds = filteredMemberships.map((m) => m.actorUserId).filter((v): v is string => Boolean(v));
    const identityIds = filteredMemberships.map((m) => m.actorIdentityId).filter((v): v is string => Boolean(v));
    const groupIds = filteredMemberships.map((m) => m.actorGroupId).filter((v): v is string => Boolean(v));

    const [users, identities, groups] = await Promise.all([
      userIds.length > 0 ? userDAL.find({ $in: { id: userIds } }) : Promise.resolve([]),
      identityIds.length > 0 ? identityDAL.find({ $in: { id: identityIds } }) : Promise.resolve([]),
      groupIds.length > 0 ? groupDAL.find({ $in: { id: groupIds } }) : Promise.resolve([])
    ]);

    const userById = new Map(users.map((u) => [u.id, u]));
    const identityById = new Map(identities.map((i) => [i.id, i]));
    const groupById = new Map(groups.map((g) => [g.id, g]));

    return filteredMemberships.map((m) => {
      const r = rolesByMembership.get(m.id);

      let details: TSignerMember["details"] = null;
      if (m.actorUserId) {
        const u = userById.get(m.actorUserId);
        if (u) {
          const fullName = [u.firstName, u.lastName].filter((p): p is string => Boolean(p?.trim())).join(" ") || null;
          details = {
            name: fullName,
            email: u.email ?? null,
            username: u.username ?? null
          };
        }
      } else if (m.actorIdentityId) {
        const i = identityById.get(m.actorIdentityId);
        if (i) {
          details = { name: i.name, authMethod: i.authMethod ?? null };
        }
      } else if (m.actorGroupId) {
        const g = groupById.get(m.actorGroupId);
        if (g) {
          details = { name: g.name, slug: g.slug };
        }
      }

      return {
        membershipId: m.id,
        signerId,
        actorUserId: m.actorUserId ?? null,
        actorIdentityId: m.actorIdentityId ?? null,
        actorGroupId: m.actorGroupId ?? null,
        role: r?.role ?? "",
        customRoleId: r?.customRoleId ?? null,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        details
      };
    });
  };

  const listEffectiveMembers = async ({
    signerId,
    kind,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TListEffectiveSignerMembersDTO): Promise<TEffectiveSignerMember[]> => {
    await $loadSignerOrThrow(signerId, projectId);
    const { permission } = await $loadResourcePermission(signerId, projectId, {
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(ResourcePermissionSignerActions.Read, ResourcePermissionSub.Signer);

    const allMemberships = await membershipDAL.find({
      scope: RESOURCE_SCOPE,
      scopeProjectId: projectId,
      scopeResourceType: ResourceType.Signer,
      scopeResourceId: signerId
    });
    if (allMemberships.length === 0) return [];

    const roles = await membershipRoleDAL.find({ $in: { membershipId: allMemberships.map((m) => m.id) } });
    const roleByMembership = new Map(roles.map((r) => [r.membershipId, r.role]));

    type EffectiveEntry = { role: string; isDirect: boolean; viaGroupIds: Set<string> };
    const idToEntry = new Map<string, EffectiveEntry>();

    for (const m of allMemberships) {
      const directActorId = kind === EffectiveSignerMemberKind.User ? m.actorUserId : m.actorIdentityId;
      const role = directActorId ? (roleByMembership.get(m.id) ?? "") : "";
      if (directActorId && role) {
        idToEntry.set(directActorId, { role, isDirect: true, viaGroupIds: new Set() });
      }
    }

    const groupMemberships = allMemberships.filter((m) => Boolean(m.actorGroupId));
    const groupIds = groupMemberships.map((m) => m.actorGroupId as string);
    if (groupIds.length > 0) {
      const expansions =
        kind === EffectiveSignerMemberKind.User
          ? await userGroupMembershipDAL.find({ $in: { groupId: groupIds } })
          : await identityGroupMembershipDAL.find({ $in: { groupId: groupIds } });

      const roleByGroupId = new Map<string, string>();
      for (const gm of groupMemberships) {
        const r = roleByMembership.get(gm.id);
        if (r) roleByGroupId.set(gm.actorGroupId as string, r);
      }

      for (const exp of expansions) {
        const memberId = "userId" in exp ? exp.userId : exp.identityId;
        const { groupId } = exp;
        const groupRole = roleByGroupId.get(groupId);
        if (groupRole) {
          const existing = idToEntry.get(memberId);
          if (!existing) {
            idToEntry.set(memberId, { role: groupRole, isDirect: false, viaGroupIds: new Set([groupId]) });
          } else {
            existing.viaGroupIds.add(groupId);
            if (!existing.isDirect) {
              existing.role = pickGroupRoleForDisplay(existing.role, groupRole);
            }
          }
        }
      }
    }

    const ids = Array.from(idToEntry.keys());
    if (ids.length === 0) return [];

    if (kind === EffectiveSignerMemberKind.User) {
      const users = await userDAL.find({ $in: { id: ids } });
      return users
        .map((u): TEffectiveSignerMember | null => {
          const entry = idToEntry.get(u.id);
          if (!entry) return null;
          const fullName = [u.firstName, u.lastName].filter((p): p is string => Boolean(p?.trim())).join(" ") || null;
          return {
            actorUserId: u.id,
            actorIdentityId: null,
            role: entry.role,
            viaGroupIds: Array.from(entry.viaGroupIds),
            isDirect: entry.isDirect,
            details: { name: fullName, email: u.email ?? null, username: u.username ?? null }
          };
        })
        .filter((r): r is TEffectiveSignerMember => r !== null);
    }

    const identities = await identityDAL.find({ $in: { id: ids } });
    return identities
      .map((i): TEffectiveSignerMember | null => {
        const entry = idToEntry.get(i.id);
        if (!entry) return null;
        return {
          actorUserId: null,
          actorIdentityId: i.id,
          role: entry.role,
          viaGroupIds: Array.from(entry.viaGroupIds),
          isDirect: entry.isDirect,
          details: { name: i.name, authMethod: i.authMethod ?? null }
        };
      })
      .filter((r): r is TEffectiveSignerMember => r !== null);
  };

  const $findMembershipByMember = async (
    signerId: string,
    projectId: string,
    kind: TSignerMemberKind,
    memberId: string
  ) => {
    const where: Record<string, unknown> = {
      scope: RESOURCE_SCOPE,
      scopeProjectId: projectId,
      scopeResourceType: ResourceType.Signer,
      scopeResourceId: signerId
    };
    if (kind === SignerMemberKind.User) where.actorUserId = memberId;
    else if (kind === SignerMemberKind.Identity) where.actorIdentityId = memberId;
    else where.actorGroupId = memberId;

    const matches = await membershipDAL.find(where);
    const membership = matches[0];
    if (!membership) {
      throw new NotFoundError({
        message: `No signer membership found for ${kind} '${memberId}' on signer '${signerId}'.`
      });
    }
    return membership;
  };

  const updateMemberRole = async ({
    signerId,
    kind,
    memberId,
    role,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TUpdateSignerMemberRoleDTO): Promise<TSignerMember> => {
    const signer = await $loadSignerOrThrow(signerId, projectId);

    const { permission } = await $loadResourcePermission(signerId, projectId, {
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionSignerActions.ManageMembers,
      ResourcePermissionSub.Signer
    );

    if (!isBuiltInSignerRole(role)) {
      throw new BadRequestError({ message: unknownSignerRoleMessage(role) });
    }

    const membership = await $findMembershipByMember(signerId, projectId, kind, memberId);

    const updated = await membershipDAL.transaction(async (tx) => {
      const updatedRoles = await membershipRoleDAL.update(
        { membershipId: membership.id },
        { role, customRoleId: null },
        tx
      );
      const r = updatedRoles[0];

      if (role === ResourceMembershipRole.Auditor && kind !== SignerMemberKind.Identity) {
        await approvalPolicyDAL.deleteStepApproversBySubject(
          {
            projectId,
            scopeType: ApprovalPolicyScope.Signer,
            scopeId: signerId,
            userId: kind === SignerMemberKind.User ? (membership.actorUserId ?? undefined) : undefined,
            groupId: kind === SignerMemberKind.Group ? (membership.actorGroupId ?? undefined) : undefined
          },
          tx
        );
      }

      return {
        membershipId: membership.id,
        signerId,
        actorUserId: membership.actorUserId ?? null,
        actorIdentityId: membership.actorIdentityId ?? null,
        actorGroupId: membership.actorGroupId ?? null,
        role: r.role,
        customRoleId: r.customRoleId ?? null,
        createdAt: membership.createdAt,
        updatedAt: membership.updatedAt
      };
    });

    const details = await $buildMemberDetails(updated);
    return { ...updated, signerName: signer.name, details };
  };

  const removeMember = async ({
    signerId,
    kind,
    memberId,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TRemoveSignerMemberDTO): Promise<{
    membershipId: string;
    signerId: string;
    signerName: string;
    actorUserId?: string | null;
    actorIdentityId?: string | null;
    actorGroupId?: string | null;
    details?: TSignerMember["details"];
  }> => {
    const signer = await $loadSignerOrThrow(signerId, projectId);

    const { permission } = await $loadResourcePermission(signerId, projectId, {
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionSignerActions.ManageMembers,
      ResourcePermissionSub.Signer
    );

    const membership = await $findMembershipByMember(signerId, projectId, kind, memberId);
    const details = await $buildMemberDetails(membership);

    await membershipDAL.transaction(async (tx) => {
      if (kind !== SignerMemberKind.Identity) {
        await approvalPolicyDAL.deleteStepApproversBySubject(
          {
            projectId,
            scopeType: ApprovalPolicyScope.Signer,
            scopeId: signerId,
            userId: kind === SignerMemberKind.User ? (membership.actorUserId ?? undefined) : undefined,
            groupId: kind === SignerMemberKind.Group ? (membership.actorGroupId ?? undefined) : undefined
          },
          tx
        );
      }
      await membershipRoleDAL.delete({ membershipId: membership.id }, tx);
      await membershipDAL.deleteById(membership.id, tx);
    });

    return {
      membershipId: membership.id,
      signerId,
      signerName: signer.name,
      actorUserId: membership.actorUserId ?? null,
      actorIdentityId: membership.actorIdentityId ?? null,
      actorGroupId: membership.actorGroupId ?? null,
      details
    };
  };

  const addUserMembers = async ({
    signerId,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    userIds,
    emails,
    role
  }: TAddSignerUserMembersDTO): Promise<{
    memberships: TSignerMember[];
    skipped: string[];
    unresolved: string[];
  }> => {
    if (!isBuiltInSignerRole(role)) {
      throw new BadRequestError({ message: unknownSignerRoleMessage(role) });
    }

    await $loadSignerOrThrow(signerId, projectId);

    const { permission } = await $loadResourcePermission(signerId, projectId, {
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionSignerActions.ManageMembers,
      ResourcePermissionSub.Signer
    );

    const usersByEmail = emails.length ? await userDAL.find({ $in: { username: emails } }) : [];
    const userByEmail = new Map<string, (typeof usersByEmail)[number]>();
    for (const u of usersByEmail) userByEmail.set(u.username, u);
    const unresolved = emails.filter((e) => !userByEmail.has(e));

    const existing = await membershipDAL.find({
      scope: RESOURCE_SCOPE,
      scopeProjectId: projectId,
      scopeResourceType: ResourceType.Signer,
      scopeResourceId: signerId
    });
    const alreadyAttached = new Set<string>(existing.map((m) => m.actorUserId).filter((v): v is string => Boolean(v)));

    const candidates: { userId: string; label: string }[] = [];
    const seen = new Set<string>();
    userIds.forEach((id) => {
      if (!seen.has(id)) {
        seen.add(id);
        candidates.push({ userId: id, label: id });
      }
    });
    emails.forEach((email) => {
      const user = userByEmail.get(email);
      if (user && !seen.has(user.id)) {
        seen.add(user.id);
        candidates.push({ userId: user.id, label: email });
      }
    });

    const candidateIds = candidates.map((t) => t.userId);
    const projectMemberRows = candidateIds.length
      ? await membershipDAL.find({
          scope: AccessScope.Project,
          scopeProjectId: projectId,
          $in: { actorUserId: candidateIds }
        })
      : [];
    const projectMemberIds = new Set(
      projectMemberRows.map((m) => m.actorUserId).filter((v): v is string => Boolean(v))
    );
    const targets = candidates.filter((t) => {
      if (projectMemberIds.has(t.userId)) return true;
      unresolved.push(t.label);
      return false;
    });

    const memberships: TSignerMember[] = [];
    const skipped: string[] = [];
    for (const t of targets) {
      if (alreadyAttached.has(t.userId)) {
        skipped.push(t.label);
      } else {
        // eslint-disable-next-line no-await-in-loop
        const m = await addMember({
          signerId,
          userId: t.userId,
          role,
          projectId,
          actor,
          actorId,
          actorAuthMethod,
          actorOrgId
        });
        memberships.push(m);
        alreadyAttached.add(t.userId);
      }
    }

    return { memberships, skipped, unresolved };
  };

  return {
    addMember,
    addUserMembers,
    listMembers,
    listEffectiveMembers,
    updateMemberRole,
    removeMember
  };
};
