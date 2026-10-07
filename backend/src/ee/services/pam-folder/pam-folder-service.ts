import { ForbiddenError } from "@casl/ability";
import { packRules } from "@casl/ability/extra";
import { Knex } from "knex";

import { RESOURCE_SCOPE, ResourceType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ResourcePermissionPamResourceActions,
  ResourcePermissionSub
} from "@app/ee/services/permission/resource-permission";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";

import { PamFolderCallerAccess, PamProductRole, PamResourceRole } from "../pam/pam-enums";
import { getResourceIdsWithActions, TActorContext, verifyProductMembership } from "../pam/pam-permission";
import { TPamAccessRequestServiceFactory } from "../pam-access-request/pam-access-request-service";
import { TPamFolderDALFactory } from "./pam-folder-dal";
import {
  TCreatePamFolderDTO,
  TDeletePamFolderDTO,
  TGetPamFolderDTO,
  TGrantPamFolderAdminAccessDTO,
  TListPamFoldersDTO,
  TUpdatePamFolderDTO
} from "./pam-folder-types";

type TPamFolderServiceFactoryDep = {
  pamFolderDAL: TPamFolderDALFactory;
  membershipDAL: Pick<
    TMembershipDALFactory,
    "create" | "find" | "delete" | "updateById" | "findResourceMembershipsForActor" | "transaction"
  >;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "create" | "delete" | "find">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getResourcePermission">;
  pamAccessRequestService: Pick<TPamAccessRequestServiceFactory, "cleanupFolderResources">;
};

export type TPamFolderServiceFactory = ReturnType<typeof pamFolderServiceFactory>;

export const pamFolderServiceFactory = ({
  pamFolderDAL,
  membershipDAL,
  membershipRoleDAL,
  permissionService,
  pamAccessRequestService
}: TPamFolderServiceFactoryDep) => {
  const verifyMembership = (projectId: string, ctx: TActorContext) =>
    verifyProductMembership(permissionService, projectId, ctx);

  const verifyProductAdmin = async (projectId: string, ctx: TActorContext) => {
    const { hasRole } = await verifyMembership(projectId, ctx);
    if (!hasRole(PamProductRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only PAM product admins can perform this action" });
    }
  };

  const checkFolderPermission = async (
    folderId: string,
    projectId: string,
    action: ResourcePermissionPamResourceActions,
    ctx: TActorContext
  ) => {
    const { permission } = await permissionService.getResourcePermission({
      actor: ctx.actor,
      actorId: ctx.actorId,
      projectId,
      resourceType: ResourceType.PamFolder,
      resourceId: folderId,
      actorAuthMethod: ctx.actorAuthMethod,
      actorOrgId: ctx.actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(action, ResourcePermissionSub.PamResource);
  };

  const list = async ({
    projectId,
    search,
    onlyAccessible,
    filterByAction,
    includeNonMemberFolders,
    ...ctx
  }: TListPamFoldersDTO & TActorContext) => {
    const { hasRole } = await verifyMembership(projectId, ctx);

    const actionsToCheck = filterByAction
      ? { anyOf: [filterByAction] }
      : { anyOf: [ResourcePermissionPamResourceActions.ReadFolder, ResourcePermissionPamResourceActions.ReadAccounts] };

    const { folderIds, accountIds } = await getResourceIdsWithActions(
      membershipDAL,
      membershipRoleDAL,
      projectId,
      actionsToCheck,
      ctx
    );

    // CreateAccounts is a folder-level action only - ignore account-level permissions for this filter
    const isFolderOnlyAction = filterByAction === ResourcePermissionPamResourceActions.CreateAccounts;
    const effectiveAccountIds = isFolderOnlyAction ? [] : accountIds;

    const listVisible = async () => {
      if (folderIds.length === 0 && effectiveAccountIds.length === 0) return [];
      return pamFolderDAL.findByProjectIdFiltered(projectId, folderIds, {
        search,
        accountIds: effectiveAccountIds,
        onlyAccessible
      });
    };

    // Product admins can ask for every folder so they can explicitly join one as admin (grantAdminAccess).
    // The folders they hold no membership on stay closed to them until they do.
    if (!includeNonMemberFolders || filterByAction || !hasRole(PamProductRole.Admin)) return listVisible();

    const [visibleFolders, allFolders, adminFolders] = await Promise.all([
      listVisible(),
      pamFolderDAL.findByProjectIdFiltered(projectId, [], { search, onlyAccessible }),
      getResourceIdsWithActions(
        membershipDAL,
        membershipRoleDAL,
        projectId,
        { allOf: [ResourcePermissionPamResourceActions.ManageMembers] },
        ctx
      )
    ]);
    const visibleById = new Map(visibleFolders.map((folder) => [folder.id, folder]));
    const adminIds = new Set(adminFolders.folderIds);

    // A visible folder keeps the row the caller would normally get, whose account count only covers the
    // accounts they can reach.
    return allFolders.map((folder) => {
      const visible = visibleById.get(folder.id);
      let callerAccess = PamFolderCallerAccess.None;
      if (adminIds.has(folder.id)) callerAccess = PamFolderCallerAccess.Admin;
      else if (visible) callerAccess = PamFolderCallerAccess.Member;
      return { ...(visible ?? folder), callerAccess };
    });
  };

  const getById = async ({ folderId, projectId, ...ctx }: TGetPamFolderDTO & TActorContext) => {
    await checkFolderPermission(folderId, projectId, ResourcePermissionPamResourceActions.ReadFolder, ctx);

    const folder = await pamFolderDAL.findById(folderId);
    if (!folder || folder.projectId !== projectId) {
      throw new NotFoundError({ message: `Folder with ID '${folderId}' not found` });
    }

    const accountCount = await pamFolderDAL.countAccountsByFolderId(folderId);
    return { ...folder, accountCount };
  };

  const grantFolderAdmin = async (folderId: string, projectId: string, ctx: TActorContext, tx: Knex) => {
    const membership = await membershipDAL.create(
      {
        scope: RESOURCE_SCOPE,
        scopeOrgId: ctx.actorOrgId,
        scopeProjectId: projectId,
        scopeResourceType: ResourceType.PamFolder,
        scopeResourceId: folderId,
        ...(ctx.actor === ActorType.USER ? { actorUserId: ctx.actorId } : { actorIdentityId: ctx.actorId }),
        isActive: true
      },
      tx
    );
    await membershipRoleDAL.create({ membershipId: membership.id, role: PamResourceRole.Admin }, tx);
  };

  const create = async ({ projectId, name, description, ...ctx }: TCreatePamFolderDTO & TActorContext) => {
    await verifyProductAdmin(projectId, ctx);

    try {
      return await pamFolderDAL.transaction(async (tx) => {
        const folder = await pamFolderDAL.create({ projectId, name, description }, tx);
        await grantFolderAdmin(folder.id, projectId, ctx, tx);
        return folder;
      });
    } catch (err) {
      if (
        err instanceof DatabaseError &&
        (err as DatabaseError & { code?: string }).code === DatabaseErrorCode.UniqueViolation
      ) {
        throw new BadRequestError({ message: `A folder named "${name}" already exists` });
      }
      throw err;
    }
  };

  const update = async ({ folderId, projectId, name, description, ...ctx }: TUpdatePamFolderDTO & TActorContext) => {
    await checkFolderPermission(folderId, projectId, ResourcePermissionPamResourceActions.EditFolder, ctx);

    const existing = await pamFolderDAL.findById(folderId);
    if (!existing || existing.projectId !== projectId) {
      throw new NotFoundError({ message: `Folder with ID '${folderId}' not found` });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;

    try {
      return await pamFolderDAL.updateById(folderId, updateData);
    } catch (err) {
      if (
        err instanceof DatabaseError &&
        (err as DatabaseError & { code?: string }).code === DatabaseErrorCode.UniqueViolation
      ) {
        throw new BadRequestError({ message: `A folder named "${name}" already exists` });
      }
      throw err;
    }
  };

  const deleteFolder = async ({ folderId, projectId, ...ctx }: TDeletePamFolderDTO & TActorContext) => {
    await checkFolderPermission(folderId, projectId, ResourcePermissionPamResourceActions.DeleteFolder, ctx);

    const existing = await pamFolderDAL.findById(folderId);
    if (!existing || existing.projectId !== projectId) {
      throw new NotFoundError({ message: `Folder with ID '${folderId}' not found` });
    }

    const accountCount = await pamFolderDAL.countAccountsByFolderId(folderId);
    if (accountCount > 0) {
      throw new BadRequestError({
        message: `Cannot delete folder "${existing.name}" because it contains ${accountCount} account(s)`
      });
    }

    return pamFolderDAL.transaction(async (tx) => {
      const memberships = await membershipDAL.find(
        {
          scope: RESOURCE_SCOPE,
          scopeResourceType: ResourceType.PamFolder,
          scopeResourceId: folderId
        },
        { tx }
      );

      if (memberships.length > 0) {
        const ids = memberships.map((m) => m.id);
        await membershipRoleDAL.delete({ $in: { membershipId: ids } }, tx);
        await membershipDAL.delete({ $in: { id: ids } }, tx);
      }

      await pamAccessRequestService.cleanupFolderResources(folderId, tx);

      return pamFolderDAL.deleteById(folderId, tx);
    });
  };

  const getFolderPermissions = async ({ folderId, projectId, ...ctx }: TGetPamFolderDTO & TActorContext) => {
    const folder = await pamFolderDAL.findById(folderId);
    if (!folder || folder.projectId !== projectId) {
      throw new NotFoundError({ message: `Folder with ID '${folderId}' not found` });
    }

    const { permission, memberships } = await permissionService.getResourcePermission({
      actor: ctx.actor,
      actorId: ctx.actorId,
      projectId,
      resourceType: ResourceType.PamFolder,
      resourceId: folderId,
      actorAuthMethod: ctx.actorAuthMethod,
      actorOrgId: ctx.actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionPamResourceActions.ReadFolder,
      ResourcePermissionSub.PamResource
    );

    // Only member managers get the roster; read-only roles must not enumerate members.
    const canManageMembers = permission.can(
      ResourcePermissionPamResourceActions.ManageMembers,
      ResourcePermissionSub.PamResource
    );

    return {
      permissions: packRules(permission.rules),
      memberships: canManageMembers ? memberships : []
    };
  };

  // The product-admin counterpart of the org admin's "access project" flow: folder access never falls back to
  // the product admin, so entering a folder is an explicit, audited membership write.
  const grantAdminAccess = async ({ folderId, projectId, ...ctx }: TGrantPamFolderAdminAccessDTO & TActorContext) => {
    await verifyProductAdmin(projectId, ctx);

    const folder = await pamFolderDAL.findById(folderId);
    if (!folder || folder.projectId !== projectId) {
      throw new NotFoundError({ message: `Folder with ID '${folderId}' not found` });
    }

    try {
      return await pamFolderDAL.transaction(async (tx) => {
        const [existing] = await membershipDAL.find(
          {
            scope: RESOURCE_SCOPE,
            scopeProjectId: projectId,
            scopeResourceType: ResourceType.PamFolder,
            scopeResourceId: folderId,
            ...(ctx.actor === ActorType.USER ? { actorUserId: ctx.actorId } : { actorIdentityId: ctx.actorId })
          },
          { tx }
        );

        if (!existing) {
          await grantFolderAdmin(folderId, projectId, ctx, tx);
          return { folder, previousRole: null };
        }

        const now = new Date();
        const roles = await membershipRoleDAL.find({ membershipId: existing.id }, { tx });
        const activeRoles = existing.isActive
          ? roles.filter(
              (r) => !r.isTemporary || (r.temporaryAccessEndTime && now < new Date(r.temporaryAccessEndTime))
            )
          : [];
        if (activeRoles.some((r) => r.role === PamResourceRole.Admin && !r.isTemporary)) {
          throw new BadRequestError({ message: `You're already an admin of folder "${folder.name}"` });
        }

        await membershipRoleDAL.delete({ membershipId: existing.id }, tx);
        await membershipRoleDAL.create({ membershipId: existing.id, role: PamResourceRole.Admin }, tx);
        if (!existing.isActive) {
          await membershipDAL.updateById(existing.id, { isActive: true }, tx);
        }

        return { folder, previousRole: activeRoles[0]?.role ?? null };
      });
    } catch (err) {
      // Two concurrent joins both see no membership; the unique index lets only one of them insert.
      if (
        err instanceof DatabaseError &&
        (err.error as { code?: string })?.code === DatabaseErrorCode.UniqueViolation
      ) {
        throw new BadRequestError({
          message: `Your access to folder "${folder.name}" changed while this request was running. Refresh and try again.`
        });
      }
      throw err;
    }
  };

  return { list, getById, create, update, deleteFolder, getFolderPermissions, grantAdminAccess };
};
