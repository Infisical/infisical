import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import { AccessScope, ActionProjectType, RESOURCE_SCOPE, ResourceType, TemporaryPermissionMode } from "@app/db/schemas";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ResourcePermissionPamResourceActions,
  ResourcePermissionSub
} from "@app/ee/services/permission/resource-permission";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { PamProductRole, PamResourceRole } from "../pam/pam-enums";
import { getResourceIdsWithActions, TActorContext } from "../pam/pam-permission";
import { TPamAccountDALFactory } from "../pam-account/pam-account-dal";
import { TPamFolderDALFactory } from "../pam-folder/pam-folder-dal";
import {
  TAddPamAccountMemberDTO,
  TAddPamFolderMemberDTO,
  TAddPamProductMemberDTO,
  TAddPamProductUserMembersDTO,
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

type TPamMembershipServiceFactoryDep = {
  membershipDAL: Pick<
    TMembershipDALFactory,
    "create" | "find" | "findById" | "delete" | "deleteById" | "findResourceMembershipsForActor" | "transaction"
  >;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "create" | "find" | "delete" | "update">;
  pamFolderDAL: Pick<TPamFolderDALFactory, "findById">;
  pamAccountDAL: Pick<TPamAccountDALFactory, "findById">;
  userDAL: Pick<TUserDALFactory, "findById" | "find">;
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
          expiresAt: roles[0]?.isTemporary ? (roles[0]?.temporaryAccessEndTime ?? null) : null,
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

  const addProductUserMembers = async ({
    projectId,
    userIds,
    emails,
    role,
    ...ctx
  }: TAddPamProductUserMembersDTO & TActorContext) => {
    await checkProductAdmin(projectId, ctx);

    if (!VALID_PRODUCT_ROLES.includes(role)) {
      throw new BadRequestError({
        message: `Invalid product role '${role}'. Expected: ${VALID_PRODUCT_ROLES.join(", ")}`
      });
    }

    const usersByEmail = emails.length ? await userDAL.find({ $in: { username: emails } }) : [];
    const userByEmail = new Map(usersByEmail.map((u) => [u.username, u]));
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

    const existing = await membershipDAL.find({
      scope: AccessScope.Project,
      scopeProjectId: projectId
    });
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
        results.push({
          membershipId: membership.id,
          userId,
          role: membershipRole.role,
          createdAt: membership.createdAt
        });
      }
      return results;
    });

    return { memberships, skipped, unresolved };
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
    expiry: string | null | undefined,
    dto: { userId?: string; groupId?: string } & TActorContext
  ) => {
    if (!VALID_RESOURCE_ROLES.includes(role as PamResourceRole)) {
      throw new BadRequestError({
        message: `Invalid resource role '${role}'. Expected: ${VALID_RESOURCE_ROLES.join(", ")}`
      });
    }

    const relativeMs = expiry ? ms(expiry) : null;
    if (expiry && (!relativeMs || relativeMs <= 0)) {
      throw new BadRequestError({ message: `Invalid expiry duration '${expiry}'` });
    }

    const { column, id, kind } = await validateActorExists(dto, dto.actorOrgId);
    await validateProductMember(projectId, dto);

    return membershipDAL.transaction(async (tx) => {
      const existing = await membershipDAL.find(
        { ...resourceScope(projectId, resourceType, resourceId), [column]: id },
        { tx }
      );
      if (existing.length > 0) {
        // Expired memberships can be replaced
        const now = new Date();
        const existingRoles = await membershipRoleDAL.find({ membershipId: existing[0].id }, { tx });
        const isStillActive = existingRoles.some(
          (r) => !r.isTemporary || (r.temporaryAccessEndTime && now < new Date(r.temporaryAccessEndTime))
        );
        if (isStillActive) {
          throw new BadRequestError({
            message: `${kind === "user" ? "User" : "Group"} is already a member of this ${resourceKey}`
          });
        }
        await membershipRoleDAL.delete({ membershipId: existing[0].id }, tx);
        await membershipDAL.deleteById(existing[0].id, tx);
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

      const now = new Date();
      const membershipRole = await membershipRoleDAL.create(
        {
          membershipId: membership.id,
          role,
          ...(relativeMs
            ? {
                isTemporary: true,
                temporaryMode: TemporaryPermissionMode.Relative,
                temporaryRange: expiry,
                temporaryAccessStartTime: now,
                temporaryAccessEndTime: new Date(now.getTime() + relativeMs)
              }
            : {})
        },
        tx
      );

      return {
        membershipId: membership.id,
        [resourceKey]: resourceId,
        userId: kind === "user" ? id : undefined,
        groupId: kind === "group" ? id : undefined,
        role: membershipRole.role,
        expiresAt: membershipRole.temporaryAccessEndTime ?? null,
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
    dto: { userId?: string; groupId?: string } & TActorContext
  ) => {
    if (!VALID_RESOURCE_ROLES.includes(role as PamResourceRole)) {
      throw new BadRequestError({
        message: `Invalid resource role '${role}'. Expected: ${VALID_RESOURCE_ROLES.join(", ")}`
      });
    }

    if (dto.userId && dto.userId === dto.actorId) {
      throw new ForbiddenRequestError({ message: "You cannot modify your own membership" });
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
    dto: { userId?: string; groupId?: string } & TActorContext
  ) => {
    if (dto.userId && dto.userId === dto.actorId) {
      throw new ForbiddenRequestError({ message: "You cannot modify your own membership" });
    }

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

    await checkManageMembers(projectId, { type: ResourceType.PamFolder, id: folderId }, ctx);

    return listResourceMembers(projectId, ResourceType.PamFolder, folderId);
  };

  const addFolderMember = async ({
    projectId,
    folderId,
    role,
    expiry,
    ...dto
  }: TAddPamFolderMemberDTO & TActorContext) => {
    await checkManageMembers(projectId, { type: ResourceType.PamFolder, id: folderId }, dto);

    const folder = await pamFolderDAL.findById(folderId);
    if (!folder || folder.projectId !== projectId) {
      throw new NotFoundError({ message: `Folder with ID '${folderId}' not found` });
    }

    return addResourceMember(projectId, ResourceType.PamFolder, folderId, "folderId", role, expiry, dto);
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

    await checkManageMembers(
      projectId,
      { type: ResourceType.PamAccount, id: accountId, parentFolderId: account.folderId },
      ctx
    );

    return listResourceMembers(projectId, ResourceType.PamAccount, accountId);
  };

  const addAccountMember = async ({
    projectId,
    accountId,
    role,
    expiry,
    ...dto
  }: TAddPamAccountMemberDTO & TActorContext) => {
    await checkAccountManagePermission(projectId, accountId, dto);
    return addResourceMember(projectId, ResourceType.PamAccount, accountId, "accountId", role, expiry, dto);
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

  const getAccessCapabilities = async ({ projectId, ...ctx }: { projectId: string } & TActorContext) => {
    const { hasRole } = await permissionService.getProjectPermission({
      actor: ctx.actor,
      actorId: ctx.actorId,
      projectId,
      actorAuthMethod: ctx.actorAuthMethod,
      actorOrgId: ctx.actorOrgId,
      actionProjectType: ActionProjectType.PAM
    });
    const isProductAdmin = hasRole(PamProductRole.Admin);

    const hasAnyResourceWith = async (action: ResourcePermissionPamResourceActions) => {
      const { folderIds, accountIds } = await getResourceIdsWithActions(
        membershipDAL,
        membershipRoleDAL,
        projectId,
        { allOf: [action] },
        ctx
      );
      return folderIds.length > 0 || accountIds.length > 0;
    };

    const [isResourceAdmin, canViewSessions, canViewAuditLogsResource] = await Promise.all([
      hasAnyResourceWith(ResourcePermissionPamResourceActions.ManageMembers),
      hasAnyResourceWith(ResourcePermissionPamResourceActions.ViewSessions),
      hasAnyResourceWith(ResourcePermissionPamResourceActions.ViewAuditLogs)
    ]);

    const canViewAuditLogs = isProductAdmin || canViewAuditLogsResource;

    return { isProductAdmin, isResourceAdmin, canViewSessions, canViewAuditLogs };
  };

  return {
    listProductMembers,
    addProductMember,
    addProductUserMembers,
    updateProductMemberRole,
    removeProductMember,
    listFolderMembers,
    addFolderMember,
    updateFolderMemberRole,
    removeFolderMember,
    listAccountMembers,
    addAccountMember,
    updateAccountMemberRole,
    removeAccountMember,
    getAccessCapabilities
  };
};
