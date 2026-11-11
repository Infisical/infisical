import { Knex } from "knex";

import { OrgMembershipRole, RESOURCE_SCOPE, ResourceType, TMemberships, TPamFolders } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { PamResourcePermissionActions, PamResourcePermissionSub, TPamDomain } from "@app/domains/pam/pam/ce/module";
import { isActiveRole } from "@app/domains/platform/access-control/ce/module";
import { TOrganizationsDomain } from "@app/domains/platform/organizations/ce/module";
import { TProjectsDomain } from "@app/domains/platform/projects/ce/module";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { ActorType } from "@app/lib/auth/actor-types";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, ConflictError, DatabaseError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TActorInput } from "@app/lib/types";
import { TAlertServiceFactory } from "@app/services/alert/alert-service";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";
import { NotificationType } from "@app/services/notification/notification-types";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { PAM_FOLDER_RESOURCE_TYPE } from "../pam-access-request/pam-access-request-events";
import { TPamAccessRequestServiceFactory } from "../pam-access-request/pam-access-request-service";
import { PamFolderCallerAccess, PamProductRole, PamResourceRole } from "../pam/pam-enums";
import { getResourceIdsWithActions, verifyProductMembership } from "../pam/pam-permission";
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
  organizationsDomain: Pick<TOrganizationsDomain, "getOrgPermission">;
  projectsDomain: Pick<TProjectsDomain, "getProjectPermission">;
  pamDomain: Pick<TPamDomain, "getPamPermission">;
  pamAccessRequestService: Pick<TPamAccessRequestServiceFactory, "cleanupFolderResources">;
  userDAL: Pick<TUserDALFactory, "find" | "findById">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
  smtpService: Pick<TSmtpService, "sendMail">;
  alertService: Pick<TAlertServiceFactory, "deleteAlertsForDeletedResource">;
};

export type TPamFolderServiceFactory = ReturnType<typeof pamFolderServiceFactory>;

export const pamFolderServiceFactory = ({
  pamFolderDAL,
  membershipDAL,
  membershipRoleDAL,
  organizationsDomain,
  projectsDomain,
  pamDomain,
  pamAccessRequestService,
  userDAL,
  userGroupMembershipDAL,
  notificationService,
  smtpService,
  alertService
}: TPamFolderServiceFactoryDep) => {
  const verifyMembership = (projectId: string, ctx: TActorContext) =>
    verifyProductMembership(projectsDomain, projectId, ctx);

  // Joining a folder is for a person holding the org Admin role itself, the highest privilege there is, so it is
  // no escalation. Machine identities are excluded so the decision to enter a folder is always a human one.
  const canJoinFolders = async (ctx: TActorContext) => {
    if (ctx.principal.type !== ActorType.USER) return false;
    const orgPermission = await organizationsDomain.getOrgPermission({ actor: ctx });
    return orgPermission.hasRole({ slug: OrgMembershipRole.Admin });
  };

  const verifyProductAdmin = async (projectId: string, ctx: TActorContext) => {
    const productPermission = await verifyMembership(projectId, ctx);
    if (!productPermission.hasRole({ slug: PamProductRole.Admin })) {
      throw new ForbiddenRequestError({ message: "Only PAM product admins can perform this action" });
    }
  };

  const checkFolderPermission = async (
    folderId: string,
    projectId: string,
    action: PamResourcePermissionActions,
    ctx: TActorContext
  ) => {
    const permission = await pamDomain.getPamPermission({ actor: ctx, projectId, folderId });
    permission.assert({ action, subject: PamResourcePermissionSub.PamResource });
  };

  const list = async ({
    projectId,
    search,
    onlyAccessible,
    filterByAction,
    includeNonMemberFolders,
    actor: ctx
  }: TListPamFoldersDTO & TActorInput) => {
    await verifyMembership(projectId, ctx);

    const actionsToCheck = filterByAction
      ? { anyOf: [filterByAction] }
      : { anyOf: [PamResourcePermissionActions.ReadFolder, PamResourcePermissionActions.ReadAccounts] };

    const { folderIds, accountIds } = await getResourceIdsWithActions(
      membershipDAL,
      membershipRoleDAL,
      projectId,
      actionsToCheck,
      ctx
    );

    // CreateAccounts is a folder-level action only - ignore account-level permissions for this filter
    const isFolderOnlyAction = filterByAction === PamResourcePermissionActions.CreateAccounts;
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
        { allOf: [PamResourcePermissionActions.ManageMembers] },
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

  const getById = async ({ folderId, projectId, actor: ctx }: TGetPamFolderDTO & TActorInput) => {
    await checkFolderPermission(folderId, projectId, PamResourcePermissionActions.ReadFolder, ctx);

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
        scopeOrgId: ctx.org.id,
        scopeProjectId: projectId,
        scopeResourceType: ResourceType.PamFolder,
        scopeResourceId: folderId,
        ...(ctx.principal.type === ActorType.USER
          ? { actorUserId: ctx.principal.id }
          : { actorIdentityId: ctx.principal.id }),
        isActive: true
      },
      tx
    );
    await membershipRoleDAL.create({ membershipId: membership.id, role: PamResourceRole.Admin }, tx);
    return membership;
  };

  const create = async ({ projectId, name, description, actor: ctx }: TCreatePamFolderDTO & TActorInput) => {
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

  const update = async ({ folderId, projectId, name, description, actor: ctx }: TUpdatePamFolderDTO & TActorInput) => {
    await checkFolderPermission(folderId, projectId, PamResourcePermissionActions.EditFolder, ctx);

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

  const deleteFolder = async ({ folderId, projectId, actor: ctx }: TDeletePamFolderDTO & TActorInput) => {
    await checkFolderPermission(folderId, projectId, PamResourcePermissionActions.DeleteFolder, ctx);

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
      await alertService.deleteAlertsForDeletedResource(
        { resourceType: PAM_FOLDER_RESOURCE_TYPE, resourceId: folderId },
        tx
      );

      return pamFolderDAL.deleteById(folderId, tx);
    });
  };

  const getFolderPermissions = async ({ folderId, projectId, actor: ctx }: TGetPamFolderDTO & TActorInput) => {
    const folder = await pamFolderDAL.findById(folderId);
    if (!folder || folder.projectId !== projectId) {
      throw new NotFoundError({ message: `Folder with ID '${folderId}' not found` });
    }

    const permission = await pamDomain.getPamPermission({ actor: ctx, projectId, folderId });

    permission.assert({
      action: PamResourcePermissionActions.ReadFolder,
      subject: PamResourcePermissionSub.PamResource
    });

    // Only member managers get the roster; read-only roles must not enumerate members.
    const canManageMembers = permission.can({
      action: PamResourcePermissionActions.ManageMembers,
      subject: PamResourcePermissionSub.PamResource
    });

    return {
      permissions: permission.pack(),
      memberships: canManageMembers ? permission.memberships.map((membership) => membership.toJSON()) : []
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
      ].filter((id) => id !== ctx.principal.id);
      if (adminUserIds.length === 0) return;

      const [admins, actor] = await Promise.all([
        userDAL.find({ $in: { id: adminUserIds } }),
        userDAL.findById(ctx.principal.id)
      ]);
      const name = actor?.email || actor?.username || "An organization admin";

      await notificationService.createUserNotifications(
        admins.map((admin) => ({
          userId: admin.id,
          orgId: ctx.org.id,
          type: NotificationType.PAM_FOLDER_ADMIN_ACCESS_ISSUED,
          title: "Direct Folder Access Issued",
          body: `The organization admin **${name}** has self-issued admin access to the folder **${folder.name}**.`,
          link: `/organizations/${ctx.org.id}/pam/accounts`
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
  const grantAdminAccess = async ({ folderId, projectId, actor: ctx }: TGrantPamFolderAdminAccessDTO & TActorInput) => {
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
      { allOf: [PamResourcePermissionActions.ManageMembers] },
      ctx
    );
    if (adminFolderIds.includes(folderId)) {
      throw new ConflictError({ message: `You're already an admin of folder "${folder.name}"` });
    }

    let result: { folder: TPamFolders; membership: TMemberships; previousRole: string | null };
    try {
      result = await pamFolderDAL.transaction(async (tx) => {
        // Locked so a concurrent join waits for this one and then sees its admin role, instead of both
        // replacing the same old role and each inserting an admin role.
        const existing = await membershipDAL.lockResourceMembershipForActor(
          {
            projectId,
            resourceType: ResourceType.PamFolder,
            resourceId: folderId,
            actorType: ctx.principal.type,
            actorId: ctx.principal.id
          },
          tx
        );

        if (!existing) {
          const membership = await grantFolderAdmin(folderId, projectId, ctx, tx);
          return { folder, membership, previousRole: null };
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

        return { folder, membership: existing, previousRole: activeRoles[0]?.role ?? null };
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
