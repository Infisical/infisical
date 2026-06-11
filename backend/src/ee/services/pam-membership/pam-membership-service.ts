import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import { AccessScope, ActionProjectType, RESOURCE_SCOPE, ResourceType } from "@app/db/schemas";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ResourcePermissionPamResourceActions,
  ResourcePermissionSub
} from "@app/ee/services/permission/resource-permission";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { PamProductRole, PamResourceRole } from "../pam/pam-enums";
import { TPamAccountDALFactory } from "../pam-account/pam-account-dal";
import { TPamFolderDALFactory } from "../pam-folder/pam-folder-dal";
import {
  TAddPamAccountMemberDTO,
  TAddPamFolderMemberDTO,
  TAddPamProductMemberDTO,
  TListPamAccountMembersDTO,
  TListPamFolderMembersDTO,
  TListPamProductMembersDTO,
  TRemovePamAccountMemberDTO,
  TRemovePamFolderMemberDTO,
  TRemovePamProductMemberDTO,
  TUpdatePamAccountMemberDTO,
  TUpdatePamFolderMemberDTO,
  TUpdatePamProductMemberDTO
} from "./pam-membership-types";
import { TActorContext } from "./pam-permission";

type TPamMembershipServiceFactoryDep = {
  membershipDAL: Pick<
    TMembershipDALFactory,
    "create" | "find" | "findById" | "delete" | "deleteById" | "findResourceMembershipsForActor" | "transaction"
  >;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "create" | "find" | "delete" | "update">;
  pamFolderDAL: Pick<TPamFolderDALFactory, "findById">;
  pamAccountDAL: Pick<TPamAccountDALFactory, "findById">;
  userDAL: Pick<TUserDALFactory, "findById">;
  groupDAL: Pick<TGroupDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getResourcePermission">;
};

export type TPamMembershipServiceFactory = ReturnType<typeof pamMembershipServiceFactory>;

const VALID_PRODUCT_ROLES = Object.values(PamProductRole);
const VALID_RESOURCE_ROLES = Object.values(PamResourceRole);

const resolveActorColumn = (dto: { userId?: string; groupId?: string }) => {
  if (dto.userId) return { column: "actorUserId" as const, id: dto.userId, kind: "user" as const };
  if (dto.groupId) return { column: "actorGroupId" as const, id: dto.groupId, kind: "group" as const };
  throw new BadRequestError({ message: "Either userId or groupId is required" });
};

const resourceScope = (projectId: string, resourceType: ResourceType, resourceId: string) => ({
  scope: RESOURCE_SCOPE as typeof RESOURCE_SCOPE,
  scopeProjectId: projectId,
  scopeResourceType: resourceType,
  scopeResourceId: resourceId
});

export const pamMembershipServiceFactory = ({
  membershipDAL,
  membershipRoleDAL,
  pamFolderDAL,
  pamAccountDAL,
  userDAL,
  groupDAL,
  permissionService
}: TPamMembershipServiceFactoryDep) => {
  // Shared helpers

  const checkProductAdmin = async (projectId: string, ctx: TActorContext) => {
    const { hasRole } = await permissionService.getProjectPermission({
      actor: ctx.actor,
      actorId: ctx.actorId,
      projectId,
      actorAuthMethod: ctx.actorAuthMethod,
      actorOrgId: ctx.actorOrgId,
      actionProjectType: ActionProjectType.PAM
    });
    if (!hasRole(PamProductRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only PAM product admins can perform this action" });
    }
  };

  const checkManageMembers = async (
    projectId: string,
    resource: { type: ResourceType; id: string; parentFolderId?: string | null },
    ctx: TActorContext
  ) => {
    if (resource.parentFolderId) {
      try {
        const { permission } = await permissionService.getResourcePermission({
          actor: ctx.actor,
          actorId: ctx.actorId,
          projectId,
          resourceType: ResourceType.PamFolder,
          resourceId: resource.parentFolderId,
          actorAuthMethod: ctx.actorAuthMethod,
          actorOrgId: ctx.actorOrgId
        });
        ForbiddenError.from(permission).throwUnlessCan(
          ResourcePermissionPamResourceActions.ManageMembers,
          ResourcePermissionSub.PamResource
        );
        return;
      } catch {
        if (resource.type === ResourceType.PamFolder)
          throw new ForbiddenRequestError({ message: "You do not have permission to manage members on this folder" });
      }
    }

    const { permission } = await permissionService.getResourcePermission({
      actor: ctx.actor,
      actorId: ctx.actorId,
      projectId,
      resourceType: resource.type,
      resourceId: resource.id,
      actorAuthMethod: ctx.actorAuthMethod,
      actorOrgId: ctx.actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionPamResourceActions.ManageMembers,
      ResourcePermissionSub.PamResource
    );
  };

  const checkAccountManagePermission = async (projectId: string, accountId: string, ctx: TActorContext) => {
    const account = await pamAccountDAL.findById(accountId);
    if (!account || account.projectId !== projectId) {
      throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });
    }
    await checkManageMembers(
      projectId,
      { type: ResourceType.PamAccount, id: accountId, parentFolderId: account.folderId },
      ctx
    );
    return account;
  };

  const validateActorExists = async (dto: { userId?: string; groupId?: string }, orgId: string) => {
    const { column, id, kind } = resolveActorColumn(dto);

    if (kind === "user") {
      const user = await userDAL.findById(id);
      if (!user) throw new NotFoundError({ message: `User with ID '${id}' not found` });

      const orgMemberships = await membershipDAL.find({
        scope: AccessScope.Organization,
        scopeOrgId: orgId,
        actorUserId: id,
        isActive: true
      });
      if (orgMemberships.length === 0) {
        throw new BadRequestError({ message: "User must be an active member of this organization" });
      }
    } else {
      const group = await groupDAL.findById(id);
      if (!group) throw new NotFoundError({ message: `Group with ID '${id}' not found` });
      if (group.orgId !== orgId) throw new BadRequestError({ message: "Group does not belong to this organization" });
    }

    return { column, id, kind };
  };

  const validateProductMember = async (projectId: string, dto: { userId?: string; groupId?: string }) => {
    const { column, id } = resolveActorColumn(dto);
    const memberships = await membershipDAL.find({
      scope: AccessScope.Project,
      scopeProjectId: projectId,
      [column]: id
    });
    if (memberships.length === 0) {
      throw new BadRequestError({ message: "Must be a PAM product member first" });
    }
  };

  const resolveMemberships = async (
    memberships: Awaited<ReturnType<typeof membershipDAL.find>>,
    defaultRole: string
  ) => {
    return Promise.all(
      memberships.map(async (m) => {
        const roles = await membershipRoleDAL.find({ membershipId: m.id });
        return {
          membershipId: m.id,
          userId: m.actorUserId,
          identityId: m.actorIdentityId,
          groupId: m.actorGroupId,
          role: roles[0]?.role ?? defaultRole,
          isActive: m.isActive,
          createdAt: m.createdAt
        };
      })
    );
  };

  const upsertRole = async (membershipId: string, role: string, tx: Knex) => {
    const existing = await membershipRoleDAL.find({ membershipId }, { tx });
    if (existing.length > 0) {
      await membershipRoleDAL.update({ membershipId }, { role }, tx);
    } else {
      await membershipRoleDAL.create({ membershipId, role }, tx);
    }
  };

  // Product members

  const listProductMembers = async ({ projectId, ...ctx }: TListPamProductMembersDTO & TActorContext) => {
    await permissionService.getProjectPermission({
      actor: ctx.actor,
      actorId: ctx.actorId,
      projectId,
      actorAuthMethod: ctx.actorAuthMethod,
      actorOrgId: ctx.actorOrgId,
      actionProjectType: ActionProjectType.PAM
    });

    const memberships = await membershipDAL.find({ scope: AccessScope.Project, scopeProjectId: projectId });
    return resolveMemberships(memberships, PamProductRole.Member);
  };

  const addProductMember = async ({ projectId, role, ...dto }: TAddPamProductMemberDTO & TActorContext) => {
    await checkProductAdmin(projectId, dto);

    if (!VALID_PRODUCT_ROLES.includes(role)) {
      throw new BadRequestError({
        message: `Invalid product role '${role}'. Expected: ${VALID_PRODUCT_ROLES.join(", ")}`
      });
    }

    const { column, id, kind } = await validateActorExists(dto, dto.actorOrgId);

    return membershipDAL.transaction(async (tx) => {
      const existing = await membershipDAL.find(
        { scope: AccessScope.Project, scopeProjectId: projectId, [column]: id },
        { tx }
      );
      if (existing.length > 0) {
        throw new BadRequestError({
          message: `${kind === "user" ? "User" : "Group"} is already a member of this PAM product`
        });
      }

      const membership = await membershipDAL.create(
        {
          scope: AccessScope.Project,
          scopeOrgId: dto.actorOrgId,
          scopeProjectId: projectId,
          [column]: id,
          isActive: true
        },
        tx
      );

      const membershipRole = await membershipRoleDAL.create({ membershipId: membership.id, role }, tx);

      return {
        membershipId: membership.id,
        userId: kind === "user" ? id : undefined,
        groupId: kind === "group" ? id : undefined,
        role: membershipRole.role,
        createdAt: membership.createdAt
      };
    });
  };

  const assertNotLastAdmin = async (projectId: string, membershipId: string, tx?: Knex) => {
    const allProductMemberships = await membershipDAL.find(
      { scope: AccessScope.Project, scopeProjectId: projectId },
      { tx }
    );
    const otherMemberships = allProductMemberships.filter((m) => m.id !== membershipId);

    const otherRoles = await Promise.all(
      otherMemberships.map((m) => membershipRoleDAL.find({ membershipId: m.id }, { tx }))
    );
    const hasOtherAdmin = otherRoles.some((roles) => roles.some((r) => r.role === PamProductRole.Admin));
    if (!hasOtherAdmin) {
      throw new BadRequestError({ message: "Cannot remove or demote the last product admin" });
    }
  };

  const updateProductMemberRole = async ({ projectId, role, ...dto }: TUpdatePamProductMemberDTO & TActorContext) => {
    await checkProductAdmin(projectId, dto);

    if (!VALID_PRODUCT_ROLES.includes(role)) {
      throw new BadRequestError({
        message: `Invalid product role '${role}'. Expected: ${VALID_PRODUCT_ROLES.join(", ")}`
      });
    }

    const { column, id, kind } = resolveActorColumn(dto);

    return membershipDAL.transaction(async (tx) => {
      const [membership] = await membershipDAL.find(
        { scope: AccessScope.Project, scopeProjectId: projectId, [column]: id },
        { tx }
      );
      if (!membership) {
        throw new NotFoundError({
          message: `${kind === "user" ? "User" : "Group"} is not a member of this PAM product`
        });
      }

      const existingRoles = await membershipRoleDAL.find({ membershipId: membership.id }, { tx });
      const wasAdmin = existingRoles.some((r) => r.role === PamProductRole.Admin);
      if (wasAdmin && role !== PamProductRole.Admin) {
        await assertNotLastAdmin(projectId, membership.id, tx);
      }

      await upsertRole(membership.id, role, tx);

      return {
        membershipId: membership.id,
        userId: kind === "user" ? id : undefined,
        groupId: kind === "group" ? id : undefined,
        role
      };
    });
  };

  const removeProductMember = async ({ projectId, ...dto }: TRemovePamProductMemberDTO & TActorContext) => {
    await checkProductAdmin(projectId, dto);

    const { column, id, kind } = resolveActorColumn(dto);

    return membershipDAL.transaction(async (tx) => {
      const [membership] = await membershipDAL.find(
        { scope: AccessScope.Project, scopeProjectId: projectId, [column]: id },
        { tx }
      );
      if (!membership) {
        throw new NotFoundError({
          message: `${kind === "user" ? "User" : "Group"} is not a member of this PAM product`
        });
      }

      const roles = await membershipRoleDAL.find({ membershipId: membership.id }, { tx });
      if (roles.some((r) => r.role === PamProductRole.Admin)) {
        await assertNotLastAdmin(projectId, membership.id, tx);
      }

      await membershipRoleDAL.delete({ membershipId: membership.id }, tx);

      const resourceMemberships = await membershipDAL.find(
        { scope: RESOURCE_SCOPE, scopeProjectId: projectId, [column]: id },
        { tx }
      );
      await Promise.all(
        resourceMemberships.map(async (rm) => {
          await membershipRoleDAL.delete({ membershipId: rm.id }, tx);
          await membershipDAL.deleteById(rm.id, tx);
        })
      );

      await membershipDAL.deleteById(membership.id, tx);

      return {
        membershipId: membership.id,
        userId: kind === "user" ? id : undefined,
        groupId: kind === "group" ? id : undefined
      };
    });
  };

  // Resource (folder/account) members

  const listResourceMembers = async (projectId: string, resourceType: ResourceType, resourceId: string) => {
    const memberships = await membershipDAL.find(resourceScope(projectId, resourceType, resourceId));
    return resolveMemberships(memberships, PamResourceRole.Requester);
  };

  const addResourceMember = async (
    projectId: string,
    resourceType: ResourceType,
    resourceId: string,
    resourceKey: string,
    role: string,
    dto: { userId?: string; groupId?: string } & TActorContext
  ) => {
    if (!VALID_RESOURCE_ROLES.includes(role as PamResourceRole)) {
      throw new BadRequestError({
        message: `Invalid resource role '${role}'. Expected: ${VALID_RESOURCE_ROLES.join(", ")}`
      });
    }

    const { column, id, kind } = await validateActorExists(dto, dto.actorOrgId);
    await validateProductMember(projectId, dto);

    return membershipDAL.transaction(async (tx) => {
      const existing = await membershipDAL.find(
        { ...resourceScope(projectId, resourceType, resourceId), [column]: id },
        { tx }
      );
      if (existing.length > 0) {
        throw new BadRequestError({
          message: `${kind === "user" ? "User" : "Group"} is already a member of this ${resourceKey}`
        });
      }

      const membership = await membershipDAL.create(
        {
          ...resourceScope(projectId, resourceType, resourceId),
          scopeOrgId: dto.actorOrgId,
          [column]: id,
          isActive: true
        },
        tx
      );

      const membershipRole = await membershipRoleDAL.create({ membershipId: membership.id, role }, tx);

      return {
        membershipId: membership.id,
        [resourceKey]: resourceId,
        userId: kind === "user" ? id : undefined,
        groupId: kind === "group" ? id : undefined,
        role: membershipRole.role,
        createdAt: membership.createdAt
      };
    });
  };

  const updateResourceMemberRole = async (
    projectId: string,
    resourceType: ResourceType,
    resourceId: string,
    resourceKey: string,
    role: string,
    dto: { userId?: string; groupId?: string }
  ) => {
    if (!VALID_RESOURCE_ROLES.includes(role as PamResourceRole)) {
      throw new BadRequestError({
        message: `Invalid resource role '${role}'. Expected: ${VALID_RESOURCE_ROLES.join(", ")}`
      });
    }

    const { column, id, kind } = resolveActorColumn(dto);

    return membershipDAL.transaction(async (tx) => {
      const [membership] = await membershipDAL.find(
        { ...resourceScope(projectId, resourceType, resourceId), [column]: id },
        { tx }
      );
      if (!membership) {
        throw new NotFoundError({
          message: `${kind === "user" ? "User" : "Group"} is not a member of this ${resourceKey}`
        });
      }

      await upsertRole(membership.id, role, tx);

      return {
        membershipId: membership.id,
        [resourceKey]: resourceId,
        userId: kind === "user" ? id : undefined,
        groupId: kind === "group" ? id : undefined,
        role
      };
    });
  };

  const removeResourceMember = async (
    projectId: string,
    resourceType: ResourceType,
    resourceId: string,
    resourceKey: string,
    dto: { userId?: string; groupId?: string }
  ) => {
    const { column, id, kind } = resolveActorColumn(dto);

    const [membership] = await membershipDAL.find({
      ...resourceScope(projectId, resourceType, resourceId),
      [column]: id
    });
    if (!membership) {
      throw new NotFoundError({
        message: `${kind === "user" ? "User" : "Group"} is not a member of this ${resourceKey}`
      });
    }

    await membershipDAL.transaction(async (tx) => {
      await membershipRoleDAL.delete({ membershipId: membership.id }, tx);
      await membershipDAL.deleteById(membership.id, tx);
    });

    return {
      membershipId: membership.id,
      [resourceKey]: resourceId,
      userId: kind === "user" ? id : undefined,
      groupId: kind === "group" ? id : undefined
    };
  };

  // Folder members

  const listFolderMembers = async ({ projectId, folderId, ...ctx }: TListPamFolderMembersDTO & TActorContext) => {
    const folder = await pamFolderDAL.findById(folderId);
    if (!folder || folder.projectId !== projectId) {
      throw new NotFoundError({ message: `Folder with ID '${folderId}' not found` });
    }

    await permissionService.getResourcePermission({
      actor: ctx.actor,
      actorId: ctx.actorId,
      projectId,
      resourceType: ResourceType.PamFolder,
      resourceId: folderId,
      actorAuthMethod: ctx.actorAuthMethod,
      actorOrgId: ctx.actorOrgId
    });

    return listResourceMembers(projectId, ResourceType.PamFolder, folderId);
  };

  const addFolderMember = async ({ projectId, folderId, role, ...dto }: TAddPamFolderMemberDTO & TActorContext) => {
    await checkManageMembers(projectId, { type: ResourceType.PamFolder, id: folderId }, dto);

    const folder = await pamFolderDAL.findById(folderId);
    if (!folder || folder.projectId !== projectId) {
      throw new NotFoundError({ message: `Folder with ID '${folderId}' not found` });
    }

    return addResourceMember(projectId, ResourceType.PamFolder, folderId, "folderId", role, dto);
  };

  const updateFolderMemberRole = async ({
    projectId,
    folderId,
    role,
    ...dto
  }: TUpdatePamFolderMemberDTO & TActorContext) => {
    await checkManageMembers(projectId, { type: ResourceType.PamFolder, id: folderId }, dto);
    return updateResourceMemberRole(projectId, ResourceType.PamFolder, folderId, "folderId", role, dto);
  };

  const removeFolderMember = async ({ projectId, folderId, ...dto }: TRemovePamFolderMemberDTO & TActorContext) => {
    await checkManageMembers(projectId, { type: ResourceType.PamFolder, id: folderId }, dto);
    return removeResourceMember(projectId, ResourceType.PamFolder, folderId, "folderId", dto);
  };

  // Account members

  const listAccountMembers = async ({ projectId, accountId, ...ctx }: TListPamAccountMembersDTO & TActorContext) => {
    const account = await pamAccountDAL.findById(accountId);
    if (!account || account.projectId !== projectId) {
      throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });
    }

    let hasAccess = false;
    if (account.folderId) {
      try {
        const { permission } = await permissionService.getResourcePermission({
          actor: ctx.actor,
          actorId: ctx.actorId,
          projectId,
          resourceType: ResourceType.PamFolder,
          resourceId: account.folderId,
          actorAuthMethod: ctx.actorAuthMethod,
          actorOrgId: ctx.actorOrgId
        });
        ForbiddenError.from(permission).throwUnlessCan(
          ResourcePermissionPamResourceActions.ReadAccounts,
          ResourcePermissionSub.PamResource
        );
        hasAccess = true;
      } catch {
        // fall through to account-level check
      }
    }

    if (!hasAccess) {
      const { permission } = await permissionService.getResourcePermission({
        actor: ctx.actor,
        actorId: ctx.actorId,
        projectId,
        resourceType: ResourceType.PamAccount,
        resourceId: accountId,
        actorAuthMethod: ctx.actorAuthMethod,
        actorOrgId: ctx.actorOrgId
      });
      ForbiddenError.from(permission).throwUnlessCan(
        ResourcePermissionPamResourceActions.ReadAccounts,
        ResourcePermissionSub.PamResource
      );
    }

    return listResourceMembers(projectId, ResourceType.PamAccount, accountId);
  };

  const addAccountMember = async ({ projectId, accountId, role, ...dto }: TAddPamAccountMemberDTO & TActorContext) => {
    await checkAccountManagePermission(projectId, accountId, dto);
    return addResourceMember(projectId, ResourceType.PamAccount, accountId, "accountId", role, dto);
  };

  const updateAccountMemberRole = async ({
    projectId,
    accountId,
    role,
    ...dto
  }: TUpdatePamAccountMemberDTO & TActorContext) => {
    await checkAccountManagePermission(projectId, accountId, dto);
    return updateResourceMemberRole(projectId, ResourceType.PamAccount, accountId, "accountId", role, dto);
  };

  const removeAccountMember = async ({ projectId, accountId, ...dto }: TRemovePamAccountMemberDTO & TActorContext) => {
    await checkAccountManagePermission(projectId, accountId, dto);
    return removeResourceMember(projectId, ResourceType.PamAccount, accountId, "accountId", dto);
  };

  return {
    listProductMembers,
    addProductMember,
    updateProductMemberRole,
    removeProductMember,
    listFolderMembers,
    addFolderMember,
    updateFolderMemberRole,
    removeFolderMember,
    listAccountMembers,
    addAccountMember,
    updateAccountMemberRole,
    removeAccountMember
  };
};
