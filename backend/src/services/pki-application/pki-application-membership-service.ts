import { ForbiddenError } from "@casl/ability";

import { AccessScope, ApplicationMembershipRole, RESOURCE_SCOPE, ResourceType } from "@app/db/schemas";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionMemberActions } from "@app/ee/services/permission/project-permission";
import {
  ResourcePermissionApplicationActions,
  ResourcePermissionSub
} from "@app/ee/services/permission/resource-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { TIdentityDALFactory } from "../identity/identity-dal";
import { TMembershipDALFactory } from "../membership/membership-dal";
import { TMembershipRoleDALFactory } from "../membership/membership-role-dal";
import { TUserDALFactory } from "../user/user-dal";
import { TPkiApplicationDALFactory } from "./pki-application-dal";
import {
  TAddApplicationMemberDTO,
  TApplicationMember,
  TListApplicationMembersDTO,
  TRemoveApplicationMemberDTO,
  TUpdateApplicationMemberRoleDTO
} from "./pki-application-types";

type TPkiApplicationMembershipServiceFactoryDep = {
  pkiApplicationDAL: Pick<TPkiApplicationDALFactory, "findById">;
  membershipDAL: Pick<TMembershipDALFactory, "create" | "findById" | "find" | "deleteById" | "transaction">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "create" | "find" | "delete" | "update">;
  permissionService: Pick<TPermissionServiceFactory, "getResourcePermission">;
  userDAL: Pick<TUserDALFactory, "find">;
  identityDAL: Pick<TIdentityDALFactory, "find">;
  groupDAL: Pick<TGroupDALFactory, "find">;
};

export type TPkiApplicationMembershipServiceFactory = ReturnType<typeof pkiApplicationMembershipServiceFactory>;

const VALID_BUILTIN_ROLES = new Set<string>([
  ApplicationMembershipRole.Admin,
  ApplicationMembershipRole.Operator,
  ApplicationMembershipRole.Auditor
]);

const isBuiltInApplicationRole = (role: string) => VALID_BUILTIN_ROLES.has(role);

export const pkiApplicationMembershipServiceFactory = ({
  pkiApplicationDAL,
  membershipDAL,
  membershipRoleDAL,
  permissionService,
  userDAL,
  identityDAL,
  groupDAL
}: TPkiApplicationMembershipServiceFactoryDep) => {
  const $loadApplicationOrThrow = async (applicationId: string, projectId: string) => {
    const application = await pkiApplicationDAL.findById(applicationId);
    if (!application || application.projectId !== projectId) {
      throw new NotFoundError({ message: `Application with id '${applicationId}' not found.` });
    }
    return application;
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
    await $loadApplicationOrThrow(applicationId, projectId);

    const { permission } = await $loadResourcePermission(applicationId, projectId, {
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionApplicationActions.Edit,
      ResourcePermissionSub.Application
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionMemberActions.Create, ResourcePermissionSub.Member);

    if (!isBuiltInApplicationRole(role)) {
      throw new BadRequestError({
        message: `Unknown application role '${role}'. Expected one of: admin, operator, auditor.`
      });
    }

    const orgMembership = await $assertActorPresentInOrg(actorOrgId, { userId, identityId, groupId });

    return membershipDAL.transaction(async (tx) => {
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
  };

  const listMembers = async ({
    applicationId,
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

    if (memberships.length === 0) return [];

    const roles = await membershipRoleDAL.find({
      $in: { membershipId: memberships.map((m) => m.id) }
    });
    const rolesByMembership = new Map<string, (typeof roles)[number]>();
    for (const r of roles) rolesByMembership.set(r.membershipId, r);

    const userIds = memberships.map((m) => m.actorUserId).filter((v): v is string => Boolean(v));
    const identityIds = memberships.map((m) => m.actorIdentityId).filter((v): v is string => Boolean(v));
    const groupIds = memberships.map((m) => m.actorGroupId).filter((v): v is string => Boolean(v));

    const [users, identities, groups] = await Promise.all([
      userIds.length > 0 ? userDAL.find({ $in: { id: userIds } }) : Promise.resolve([]),
      identityIds.length > 0 ? identityDAL.find({ $in: { id: identityIds } }) : Promise.resolve([]),
      groupIds.length > 0 ? groupDAL.find({ $in: { id: groupIds } }) : Promise.resolve([])
    ]);

    const userById = new Map(users.map((u) => [u.id, u]));
    const identityById = new Map(identities.map((i) => [i.id, i]));
    const groupById = new Map(groups.map((g) => [g.id, g]));

    return memberships.map((m) => {
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

  const updateMemberRole = async ({
    applicationId,
    membershipId,
    role,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TUpdateApplicationMemberRoleDTO): Promise<TApplicationMember> => {
    await $loadApplicationOrThrow(applicationId, projectId);

    const { permission } = await $loadResourcePermission(applicationId, projectId, {
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionApplicationActions.Edit,
      ResourcePermissionSub.Application
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionMemberActions.Edit, ResourcePermissionSub.Member);

    if (!isBuiltInApplicationRole(role)) {
      throw new BadRequestError({
        message: `Unknown application role '${role}'. Expected one of: admin, operator, auditor.`
      });
    }

    const membership = await membershipDAL.findById(membershipId);
    if (
      !membership ||
      membership.scopeResourceType !== ResourceType.CertificateApplication ||
      membership.scopeResourceId !== applicationId ||
      membership.scopeProjectId !== projectId
    ) {
      throw new NotFoundError({ message: `Membership with id '${membershipId}' not found on this application.` });
    }

    return membershipDAL.transaction(async (tx) => {
      const updatedRoles = await membershipRoleDAL.update({ membershipId }, { role, customRoleId: null }, tx);
      const updated = updatedRoles[0];

      return {
        membershipId,
        applicationId,
        actorUserId: membership.actorUserId ?? null,
        actorIdentityId: membership.actorIdentityId ?? null,
        actorGroupId: membership.actorGroupId ?? null,
        role: updated.role,
        customRoleId: updated.customRoleId ?? null,
        createdAt: membership.createdAt,
        updatedAt: membership.updatedAt
      };
    });
  };

  const removeMember = async ({
    applicationId,
    membershipId,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TRemoveApplicationMemberDTO): Promise<{ membershipId: string; applicationId: string }> => {
    await $loadApplicationOrThrow(applicationId, projectId);

    const { permission } = await $loadResourcePermission(applicationId, projectId, {
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionApplicationActions.Edit,
      ResourcePermissionSub.Application
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionMemberActions.Delete, ResourcePermissionSub.Member);

    const membership = await membershipDAL.findById(membershipId);
    if (
      !membership ||
      membership.scopeResourceType !== ResourceType.CertificateApplication ||
      membership.scopeResourceId !== applicationId ||
      membership.scopeProjectId !== projectId
    ) {
      throw new NotFoundError({ message: `Membership with id '${membershipId}' not found on this application.` });
    }

    await membershipDAL.transaction(async (tx) => {
      await membershipRoleDAL.delete({ membershipId }, tx);
      await membershipDAL.deleteById(membershipId, tx);
    });

    return { membershipId, applicationId };
  };

  return { addMember, listMembers, updateMemberRole, removeMember };
};
