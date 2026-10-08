import { ForbiddenError } from "@casl/ability";
import { packRules } from "@casl/ability/extra";
import { Knex } from "knex";

import { OrganizationActionScope, OrgMembershipRole, RESOURCE_SCOPE, ResourceType, TPamFolders } from "@app/db/schemas";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { isActiveRole } from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ResourcePermissionPamResourceActions,
  ResourcePermissionSub
} from "@app/ee/services/permission/resource-permission";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, ConflictError, DatabaseError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ActorType } from "@app/services/auth/auth-type";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";
import { NotificationType } from "@app/services/notification/notification-types";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

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
    | "create"
    | "find"
    | "delete"
    | "updateById"
    | "findResourceMembershipsForActor"
    | "lockResourceMembershipForActor"
    | "transaction"
  >;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "create" | "delete" | "find">;
  permissionService: Pick<
    TPermissionServiceFactory,
    "getOrgPermission" | "getProjectPermission" | "getResourcePermission"
  >;
  pamAccessRequestService: Pick<TPamAccessRequestServiceFactory, "cleanupFolderResources">;
  userDAL: Pick<TUserDALFactory, "find" | "findById">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
  smtpService: Pick<TSmtpService, "sendMail">;
};

export type TPamFolderServiceFactory = ReturnType<typeof pamFolderServiceFactory>;

export const pamFolderServiceFactory = ({
  pamFolderDAL,
  membershipDAL,
  membershipRoleDAL,
  permissionService,
  pamAccessRequestService,
  userDAL,
  userGroupMembershipDAL,
  notificationService,
  smtpService
}: TPamFolderServiceFactoryDep) => {
  const verifyMembership = (projectId: string, ctx: TActorContext) =>
    verifyProductMembership(permissionService, projectId, ctx);

  // Joining a folder is for a person holding the org Admin role itself, the highest privilege there is, so it is
  // no escalation. Machine identities are excluded so the decision to enter a folder is always a human one.
  const canJoinFolders = async (ctx: TActorContext) => {
    if (ctx.actor !== ActorType.USER) return false;
    const { hasRole } = await permissionService.getOrgPermission({
      actor: ctx.actor,
      actorId: ctx.actorId,
      orgId: ctx.actorOrgId,
      actorAuthMethod: ctx.actorAuthMethod,
      actorOrgId: ctx.actorOrgId,
      scope: OrganizationActionScope.Any
    });
    return hasRole(OrgMembershipRole.Admin);
  };

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
    await verifyMembership(projectId, ctx);

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

    // Org admins can ask for every folder so they can explicitly join one as admin (grantAdminAccess).
    // The folders they hold no membership on stay closed to them until they do.
    if (!includeNonMemberFolders || filterByAction) return listVisible();
    if (!(await canJoinFolders(ctx))) return listVisible();

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
        (err.error as { code?: string })?.code === DatabaseErrorCode.UniqueViolation
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
        (err.error as { code?: string })?.code === DatabaseErrorCode.UniqueViolation
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

  // Tells the folder's admins that an org admin let themselves in. Runs after commit without being awaited and
  // never throws: the access is already granted and audited by then.
  const notifyFolderAdminsOfAdminAccess = async (folder: TPamFolders, ctx: TActorContext) => {
    try {
      const memberships = await membershipDAL.find({
        scope: RESOURCE_SCOPE,
        scopeProjectId: folder.projectId,
        scopeResourceType: ResourceType.PamFolder,
        scopeResourceId: folder.id,
        isActive: true
      });
      const roles = memberships.length
        ? await membershipRoleDAL.find({ $in: { membershipId: memberships.map((m) => m.id) } })
        : [];
      const adminMembershipIds = new Set(
        roles.filter((r) => r.role === PamResourceRole.Admin && isActiveRole(r)).map((r) => r.membershipId)
      );
      const adminMemberships = memberships.filter((m) => adminMembershipIds.has(m.id));
      const adminGroupIds = adminMemberships.map((m) => m.actorGroupId).filter((id): id is string => Boolean(id));
      const groupMembers = adminGroupIds.length
        ? await userGroupMembershipDAL.find({ $in: { groupId: adminGroupIds }, isPending: false })
        : [];

      const adminUserIds = [
        ...new Set([
          ...adminMemberships.map((m) => m.actorUserId).filter((id): id is string => Boolean(id)),
          ...groupMembers.map((m) => m.userId)
        ])
      ].filter((id) => id !== ctx.actorId);
      if (adminUserIds.length === 0) return;

      const [admins, actor] = await Promise.all([
        userDAL.find({ $in: { id: adminUserIds } }),
        userDAL.findById(ctx.actorId)
      ]);
      const name = actor?.email || actor?.username || "An organization admin";

      await notificationService.createUserNotifications(
        admins.map((admin) => ({
          userId: admin.id,
          orgId: ctx.actorOrgId,
          type: NotificationType.PAM_FOLDER_ADMIN_ACCESS_ISSUED,
          title: "Direct Folder Access Issued",
          body: `The organization admin **${name}** has self-issued admin access to the folder **${folder.name}**.`,
          link: `/organizations/${ctx.actorOrgId}/pam/accounts`
        }))
      );

      const recipients = admins.map((admin) => admin.email).filter((email): email is string => Boolean(email));
      if (recipients.length > 0) {
        await smtpService.sendMail({
          template: SmtpTemplates.PamFolderAdminAccess,
          recipients,
          subjectLine: "Organization Admin PAM Folder Direct Access Issued",
          substitutions: { actorName: name, folderName: folder.name }
        });
      }
    } catch (err) {
      logger.error(err, `Failed to notify folder admins of an org admin joining [folderId=${folder.id}]`);
    }
  };

  // Folder access never falls back to anyone, so an org admin entering a folder is an explicit, audited
  // membership write.
  const grantAdminAccess = async ({ folderId, projectId, ...ctx }: TGrantPamFolderAdminAccessDTO & TActorContext) => {
    await verifyMembership(projectId, ctx);
    if (!(await canJoinFolders(ctx))) {
      throw new ForbiddenRequestError({ message: "Only organization admins can join a PAM folder as admin" });
    }

    const folder = await pamFolderDAL.findById(folderId);
    if (!folder || folder.projectId !== projectId) {
      throw new NotFoundError({ message: `Folder with ID '${folderId}' not found` });
    }

    // Same test the folder list uses for callerAccess, so a temporary or group-held admin is refused too.
    const { folderIds: adminFolderIds } = await getResourceIdsWithActions(
      membershipDAL,
      membershipRoleDAL,
      projectId,
      { allOf: [ResourcePermissionPamResourceActions.ManageMembers] },
      ctx
    );
    if (adminFolderIds.includes(folderId)) {
      throw new ConflictError({ message: `You're already an admin of folder "${folder.name}"` });
    }

    let result: { folder: TPamFolders; previousRole: string | null };
    try {
      result = await pamFolderDAL.transaction(async (tx) => {
        // Locked so a concurrent join waits for this one and then sees its admin role, instead of both
        // replacing the same old role and each inserting an admin role.
        const existing = await membershipDAL.lockResourceMembershipForActor(
          {
            projectId,
            resourceType: ResourceType.PamFolder,
            resourceId: folderId,
            actorType: ctx.actor,
            actorId: ctx.actorId
          },
          tx
        );

        if (!existing) {
          await grantFolderAdmin(folderId, projectId, ctx, tx);
          return { folder, previousRole: null };
        }

        const roles = await membershipRoleDAL.find({ membershipId: existing.id }, { tx });
        const activeRoles = existing.isActive ? roles.filter(isActiveRole) : [];
        if (activeRoles.some((r) => r.role === PamResourceRole.Admin)) {
          throw new ConflictError({ message: `You're already an admin of folder "${folder.name}"` });
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
        throw new ConflictError({
          message: `Your access to folder "${folder.name}" changed while this request was running. Refresh and try again.`
        });
      }
      throw err;
    }

    void notifyFolderAdminsOfAdminAccess(folder, ctx);
    return result;
  };

  return { list, getById, create, update, deleteFolder, getFolderPermissions, grantAdminAccess };
};
