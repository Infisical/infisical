import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import { AccessScope, RESOURCE_SCOPE, ResourceMembershipRole, ResourceType } from "@app/db/schemas";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { TIdentityGroupMembershipDALFactory } from "@app/ee/services/group/identity-group-membership-dal";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionMemberActions } from "@app/ee/services/permission/project-permission";
import {
  ResourcePermissionApplicationActions,
  ResourcePermissionSub
} from "@app/ee/services/permission/resource-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { TApprovalPolicyDALFactory } from "../approval-policy/approval-policy-dal";
import { ApprovalPolicyScope } from "../approval-policy/approval-policy-enums";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TMembershipDALFactory } from "../membership/membership-dal";
import { TMembershipRoleDALFactory } from "../membership/membership-role-dal";
import { TUserDALFactory } from "../user/user-dal";
import { TPkiApplicationDALFactory } from "./pki-application-dal";
import {
  ApplicationMemberKind,
  TAddApplicationMemberDTO,
  TAddApplicationUserMembersDTO,
  TApplicationMember,
  TApplicationMemberKind,
  TListApplicationMembersDTO,
  TRemoveApplicationMemberDTO,
  TUpdateApplicationMemberRoleDTO
} from "./pki-application-types";

type TPkiApplicationMembershipServiceFactoryDep = {
  pkiApplicationDAL: Pick<TPkiApplicationDALFactory, "findById" | "find">;
  membershipDAL: Pick<TMembershipDALFactory, "create" | "findById" | "find" | "deleteById" | "transaction">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "create" | "find" | "delete" | "update">;
  permissionService: Pick<TPermissionServiceFactory, "getResourcePermission">;
  userDAL: Pick<TUserDALFactory, "find">;
  identityDAL: Pick<TIdentityDALFactory, "find">;
  groupDAL: Pick<TGroupDALFactory, "find">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">;
  identityGroupMembershipDAL: Pick<TIdentityGroupMembershipDALFactory, "find">;
  approvalPolicyDAL: Pick<
    TApprovalPolicyDALFactory,
    "findPoliciesWhereSubjectIsApprover" | "deleteStepApproversBySubject"
  >;
};

export type TPkiApplicationMembershipServiceFactory = ReturnType<typeof pkiApplicationMembershipServiceFactory>;

const BUILTIN_APPLICATION_ROLES = Object.values(ResourceMembershipRole).filter(
  (r) => r !== ResourceMembershipRole.Custom
);

const isBuiltInApplicationRole = (role: string): role is ResourceMembershipRole =>
  (BUILTIN_APPLICATION_ROLES as string[]).includes(role);

const unknownApplicationRoleMessage = (role: string) =>
  `Unknown application role '${role}'. Expected one of: ${BUILTIN_APPLICATION_ROLES.join(", ")}.`;

export const pkiApplicationMembershipServiceFactory = ({
  pkiApplicationDAL,
  membershipDAL,
  membershipRoleDAL,
  permissionService,
  userDAL,
  identityDAL,
  groupDAL,
  userGroupMembershipDAL,
  identityGroupMembershipDAL,
  approvalPolicyDAL
}: TPkiApplicationMembershipServiceFactoryDep) => {
  const $projectGroupIds = async (projectId: string, tx?: Knex): Promise<string[]> => {
    const projectMemberships = await membershipDAL.find(
      { scope: AccessScope.Project, scopeProjectId: projectId },
      tx ? { tx } : undefined
    );
    return projectMemberships.map((m) => m.actorGroupId).filter((id): id is string => Boolean(id));
  };

  const $usersWithGroupProjectAccess = async (
    projectId: string,
    userIds: string[],
    tx?: Knex
  ): Promise<Set<string>> => {
    if (userIds.length === 0) return new Set();
    const projectGroupIds = await $projectGroupIds(projectId, tx);
    if (projectGroupIds.length === 0) return new Set();

    const candidateIds = new Set(userIds);
    const groupUsers = await userGroupMembershipDAL.find(
      { $in: { groupId: projectGroupIds } },
      tx ? { tx } : undefined
    );
    return new Set(groupUsers.map((gu) => gu.userId).filter((id) => candidateIds.has(id)));
  };

  const $identitiesWithGroupProjectAccess = async (
    projectId: string,
    identityIds: string[],
    tx?: Knex
  ): Promise<Set<string>> => {
    if (identityIds.length === 0) return new Set();
    const projectGroupIds = await $projectGroupIds(projectId, tx);
    if (projectGroupIds.length === 0) return new Set();

    const candidateIds = new Set(identityIds);
    const groupIdentities = await identityGroupMembershipDAL.find(
      { $in: { groupId: projectGroupIds } },
      tx ? { tx } : undefined
    );
    return new Set(groupIdentities.map((gi) => gi.identityId).filter((id) => candidateIds.has(id)));
  };

  const $loadApplicationOrThrow = async (applicationId: string, projectId: string) => {
    const application = await pkiApplicationDAL.findById(applicationId);
    if (!application || application.projectId !== projectId) {
      throw new NotFoundError({ message: `Application with id '${applicationId}' not found.` });
    }
    return application;
  };

  const $buildMemberDetails = async (member: {
    actorUserId?: string | null;
    actorIdentityId?: string | null;
    actorGroupId?: string | null;
  }): Promise<TApplicationMember["details"]> => {
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
    applicationId: string,
    projectId: string,
    ctx: {
      actor: TAddApplicationMemberDTO["actor"];
      actorId: string;
      actorAuthMethod: TAddApplicationMemberDTO["actorAuthMethod"];
      actorOrgId?: string;
    }
  ) =>
    permissionService.getResourcePermission({
      actor: ctx.actor,
      actorId: ctx.actorId,
      projectId,
      resourceType: ResourceType.CertificateApplication,
      resourceId: applicationId,
      actorAuthMethod: ctx.actorAuthMethod,
      actorOrgId: ctx.actorOrgId
    });

  const addMember = async ({
    applicationId,
    userId,
    identityId,
    groupId,
    role,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TAddApplicationMemberDTO): Promise<TApplicationMember> => {
    const application = await $loadApplicationOrThrow(applicationId, projectId);

    const { permission } = await $loadResourcePermission(applicationId, projectId, {
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionMemberActions.Create, ResourcePermissionSub.Member);

    if (!isBuiltInApplicationRole(role)) {
      throw new BadRequestError({
        message: unknownApplicationRoleMessage(role)
      });
    }

    const orgMembership = await $assertActorPresentInOrg(actorOrgId, { userId, identityId, groupId });

    const membership = await membershipDAL.transaction(async (tx) => {
      const existingAppMembershipFilter: Record<string, unknown> = {
        scope: RESOURCE_SCOPE,
        scopeProjectId: projectId,
        scopeResourceType: ResourceType.CertificateApplication,
        scopeResourceId: applicationId
      };
      if (userId) existingAppMembershipFilter.actorUserId = userId;
      else if (identityId) existingAppMembershipFilter.actorIdentityId = identityId;
      else if (groupId) existingAppMembershipFilter.actorGroupId = groupId;
      const existingAppMembership = await membershipDAL.find(existingAppMembershipFilter, { tx });
      if (existingAppMembership.length > 0) {
        // eslint-disable-next-line no-nested-ternary
        const subjectLabel = userId ? "user" : identityId ? "identity" : "group";
        throw new BadRequestError({
          message: `This ${subjectLabel} is already a member of this Application.`
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

      let hasProjectAccess = existingProjectMembership.length > 0;
      if (!hasProjectAccess && userId) {
        const usersViaGroup = await $usersWithGroupProjectAccess(projectId, [userId], tx);
        hasProjectAccess = usersViaGroup.has(userId);
      }
      if (!hasProjectAccess && identityId) {
        const identitiesViaGroup = await $identitiesWithGroupProjectAccess(projectId, [identityId], tx);
        hasProjectAccess = identitiesViaGroup.has(identityId);
      }

      if (!hasProjectAccess) {
        // eslint-disable-next-line no-nested-ternary
        const subjectLabel = userId ? "user" : identityId ? "machine identity" : "group";
        throw new BadRequestError({
          message: `This ${subjectLabel} can't be added here yet. Grant them access under Access Control first, then assign them to the application.`
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
          scopeResourceType: ResourceType.CertificateApplication,
          scopeResourceId: applicationId,
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
        applicationId,
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
    return { ...membership, applicationName: application.name, details };
  };

  const listMembers = async ({
    applicationId,
    kind,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TListApplicationMembersDTO): Promise<TApplicationMember[]> => {
    await $loadApplicationOrThrow(applicationId, projectId);

    const { permission } = await $loadResourcePermission(applicationId, projectId, {
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionApplicationActions.Read,
      ResourcePermissionSub.Application
    );

    const memberships = await membershipDAL.find({
      scope: RESOURCE_SCOPE,
      scopeProjectId: projectId,
      scopeResourceType: ResourceType.CertificateApplication,
      scopeResourceId: applicationId
    });

    const filteredMemberships = kind
      ? memberships.filter((m) => {
          if (kind === ApplicationMemberKind.User) return Boolean(m.actorUserId);
          if (kind === ApplicationMemberKind.Identity) return Boolean(m.actorIdentityId);
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

      let details: TApplicationMember["details"] = null;
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
        applicationId,
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

  const $findMembershipByMember = async (
    applicationId: string,
    projectId: string,
    kind: TApplicationMemberKind,
    memberId: string
  ) => {
    const where: Record<string, unknown> = {
      scope: RESOURCE_SCOPE,
      scopeProjectId: projectId,
      scopeResourceType: ResourceType.CertificateApplication,
      scopeResourceId: applicationId
    };
    if (kind === ApplicationMemberKind.User) where.actorUserId = memberId;
    else if (kind === ApplicationMemberKind.Identity) where.actorIdentityId = memberId;
    else where.actorGroupId = memberId;

    const matches = await membershipDAL.find(where);
    const membership = matches[0];
    if (!membership) {
      throw new NotFoundError({
        message: `No application membership found for ${kind} '${memberId}' on application '${applicationId}'.`
      });
    }
    return membership;
  };

  const updateMemberRole = async ({
    applicationId,
    kind,
    memberId,
    role,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TUpdateApplicationMemberRoleDTO): Promise<TApplicationMember> => {
    const application = await $loadApplicationOrThrow(applicationId, projectId);

    const { permission } = await $loadResourcePermission(applicationId, projectId, {
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionMemberActions.Edit, ResourcePermissionSub.Member);

    if (!isBuiltInApplicationRole(role)) {
      throw new BadRequestError({
        message: unknownApplicationRoleMessage(role)
      });
    }

    const membership = await $findMembershipByMember(applicationId, projectId, kind, memberId);

    const updated = await membershipDAL.transaction(async (tx) => {
      const updatedRoles = await membershipRoleDAL.update(
        { membershipId: membership.id },
        { role, customRoleId: null },
        tx
      );
      const r = updatedRoles[0];

      if (role === ResourceMembershipRole.Auditor && kind !== ApplicationMemberKind.Identity) {
        await approvalPolicyDAL.deleteStepApproversBySubject(
          {
            projectId,
            scopeType: ApprovalPolicyScope.PkiApplication,
            scopeId: applicationId,
            userId: kind === ApplicationMemberKind.User ? (membership.actorUserId ?? undefined) : undefined,
            groupId: kind === ApplicationMemberKind.Group ? (membership.actorGroupId ?? undefined) : undefined
          },
          tx
        );
      }

      return {
        membershipId: membership.id,
        applicationId,
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
    return { ...updated, applicationName: application.name, details };
  };

  const removeMember = async ({
    applicationId,
    kind,
    memberId,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TRemoveApplicationMemberDTO): Promise<{
    membershipId: string;
    applicationId: string;
    applicationName: string;
    actorUserId?: string | null;
    actorIdentityId?: string | null;
    actorGroupId?: string | null;
    details?: TApplicationMember["details"];
  }> => {
    const application = await $loadApplicationOrThrow(applicationId, projectId);

    const { permission } = await $loadResourcePermission(applicationId, projectId, {
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionMemberActions.Delete, ResourcePermissionSub.Member);

    const membership = await $findMembershipByMember(applicationId, projectId, kind, memberId);
    const details = await $buildMemberDetails(membership);

    await membershipDAL.transaction(async (tx) => {
      if (kind !== ApplicationMemberKind.Identity) {
        await approvalPolicyDAL.deleteStepApproversBySubject(
          {
            projectId,
            scopeType: ApprovalPolicyScope.PkiApplication,
            scopeId: applicationId,
            userId: kind === ApplicationMemberKind.User ? (membership.actorUserId ?? undefined) : undefined,
            groupId: kind === ApplicationMemberKind.Group ? (membership.actorGroupId ?? undefined) : undefined
          },
          tx
        );
      }
      await membershipRoleDAL.delete({ membershipId: membership.id }, tx);
      await membershipDAL.deleteById(membership.id, tx);
    });

    return {
      membershipId: membership.id,
      applicationId,
      applicationName: application.name,
      actorUserId: membership.actorUserId ?? null,
      actorIdentityId: membership.actorIdentityId ?? null,
      actorGroupId: membership.actorGroupId ?? null,
      details
    };
  };

  const addUserMembers = async ({
    applicationId,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    userIds,
    emails,
    role
  }: TAddApplicationUserMembersDTO): Promise<{
    memberships: TApplicationMember[];
    skipped: string[];
    unresolved: string[];
  }> => {
    if (!isBuiltInApplicationRole(role)) {
      throw new BadRequestError({
        message: unknownApplicationRoleMessage(role)
      });
    }

    await $loadApplicationOrThrow(applicationId, projectId);

    const { permission } = await $loadResourcePermission(applicationId, projectId, {
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionMemberActions.Create, ResourcePermissionSub.Member);

    const usersByEmail = emails.length ? await userDAL.find({ $in: { username: emails } }) : [];
    const userByEmail = new Map<string, (typeof usersByEmail)[number]>();
    for (const u of usersByEmail) userByEmail.set(u.username, u);
    const unresolved = emails.filter((e) => !userByEmail.has(e));

    const existing = await membershipDAL.find({
      scope: RESOURCE_SCOPE,
      scopeProjectId: projectId,
      scopeResourceType: ResourceType.CertificateApplication,
      scopeResourceId: applicationId
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
    const usersViaGroup = await $usersWithGroupProjectAccess(projectId, candidateIds);
    usersViaGroup.forEach((id) => projectMemberIds.add(id));

    const targets = candidates.filter((t) => {
      if (projectMemberIds.has(t.userId)) return true;
      unresolved.push(t.label);
      return false;
    });

    const memberships: TApplicationMember[] = [];
    const skipped: string[] = [];
    for (const t of targets) {
      if (alreadyAttached.has(t.userId)) {
        skipped.push(t.label);
      } else {
        // eslint-disable-next-line no-await-in-loop
        const m = await addMember({
          applicationId,
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
    updateMemberRole,
    removeMember
  };
};
