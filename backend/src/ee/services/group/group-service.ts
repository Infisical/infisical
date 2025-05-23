import { ForbiddenError } from "@casl/ability";
import slugify from "@sindresorhus/slugify";

import { OrgMembershipRole, TOrgRoles } from "@app/db/schemas";
import { TOidcConfigDALFactory } from "@app/ee/services/oidc/oidc-config-dal";
import { BadRequestError, NotFoundError, PermissionBoundaryError, UnauthorizedError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { TGroupProjectDALFactory } from "@app/services/group-project/group-project-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectBotDALFactory } from "@app/services/project-bot/project-bot-dal";
import { TProjectKeyDALFactory } from "@app/services/project-key/project-key-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TLicenseServiceFactory } from "../license/license-service";
import { OrgPermissionGroupActions, OrgPermissionSubjects } from "../permission/org-permission";
import { constructPermissionErrorMessage, validatePrivilegeChangeOperation } from "../permission/permission-fns";
import { TPermissionServiceFactory } from "../permission/permission-service";
import { TGroupDALFactory } from "./group-dal";
import { addUsersToGroupByUserIds, removeUsersFromGroupByUserIds } from "./group-fns";
import {
  TAddUserToGroupDTO,
  TCreateGroupDTO,
  TDeleteGroupDTO,
  TGetGroupByIdDTO,
  TListGroupUsersDTO,
  TRemoveUserFromGroupDTO,
  TUpdateGroupDTO
} from "./group-types";
import { TUserGroupMembershipDALFactory } from "./user-group-membership-dal";

type TGroupServiceFactoryDep = {
  userDAL: Pick<TUserDALFactory, "find" | "findUserEncKeyByUserIdsBatch" | "transaction" | "findUserByUsername">;
  groupDAL: Pick<
    TGroupDALFactory,
    "create" | "findOne" | "update" | "delete" | "findAllGroupPossibleMembers" | "findById" | "transaction"
  >;
  groupProjectDAL: Pick<TGroupProjectDALFactory, "find">;
  orgDAL: Pick<TOrgDALFactory, "findMembership" | "countAllOrgMembers">;
  userGroupMembershipDAL: Pick<
    TUserGroupMembershipDALFactory,
    "findOne" | "delete" | "filterProjectsByUserMembership" | "transaction" | "insertMany" | "find"
  >;
  projectDAL: Pick<TProjectDALFactory, "findProjectGhostUser">;
  projectBotDAL: Pick<TProjectBotDALFactory, "findOne">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "find" | "delete" | "findLatestProjectKey" | "insertMany">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getOrgPermissionByRole">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  oidcConfigDAL: Pick<TOidcConfigDALFactory, "findOne">;
};

export type TGroupServiceFactory = ReturnType<typeof groupServiceFactory>;

export const groupServiceFactory = ({
  userDAL,
  groupDAL,
  groupProjectDAL,
  orgDAL,
  userGroupMembershipDAL,
  projectDAL,
  projectBotDAL,
  projectKeyDAL,
  permissionService,
  licenseService,
  oidcConfigDAL
}: TGroupServiceFactoryDep) => {
  const createGroup = async ({ name, slug, role, actor, actorId, actorAuthMethod, actorOrgId }: TCreateGroupDTO) => {
    if (!actorOrgId) throw new UnauthorizedError({ message: "No organization ID provided in request" });

    const { permission, membership } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionGroupActions.Create, OrgPermissionSubjects.Groups);

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.groups)
      throw new BadRequestError({
        message: "Failed to create group due to plan restriction. Upgrade plan to create group."
      });

    const { permission: rolePermission, role: customRole } = await permissionService.getOrgPermissionByRole(
      role,
      actorOrgId
    );
    const isCustomRole = Boolean(customRole);
    if (role !== OrgMembershipRole.NoAccess) {
      const permissionBoundary = validatePrivilegeChangeOperation(
        membership.shouldUseNewPrivilegeSystem,
        OrgPermissionGroupActions.GrantPrivileges,
        OrgPermissionSubjects.Groups,
        permission,
        rolePermission
      );

      if (!permissionBoundary.isValid)
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "Failed to create group",
            membership.shouldUseNewPrivilegeSystem,
            OrgPermissionGroupActions.GrantPrivileges,
            OrgPermissionSubjects.Groups
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
    }

    const group = await groupDAL.transaction(async (tx) => {
      const existingGroup = await groupDAL.findOne({ orgId: actorOrgId, name }, tx);
      if (existingGroup) {
        throw new BadRequestError({
          message: `Failed to create group with name '${name}'. Group with the same name already exists`
        });
      }

      const newGroup = await groupDAL.create(
        {
          name,
          slug: slug || slugify(`${name}-${alphaNumericNanoId(4)}`),
          orgId: actorOrgId,
          role: isCustomRole ? OrgMembershipRole.Custom : role,
          roleId: customRole?.id
        },
        tx
      );

      return newGroup;
    });

    return group;
  };

  const updateGroup = async ({
    id,
    name,
    slug,
    role,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TUpdateGroupDTO) => {
    if (!actorOrgId) throw new UnauthorizedError({ message: "No organization ID provided in request" });

    const { permission, membership } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionGroupActions.Edit, OrgPermissionSubjects.Groups);

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.groups)
      throw new BadRequestError({
        message: "Failed to update group due to plan restriction Upgrade plan to update group."
      });

    const group = await groupDAL.findOne({ orgId: actorOrgId, id });
    if (!group) {
      throw new NotFoundError({ message: `Failed to find group with ID ${id}` });
    }

    let customRole: TOrgRoles | undefined;
    if (role) {
      const { permission: rolePermission, role: customOrgRole } = await permissionService.getOrgPermissionByRole(
        role,
        group.orgId
      );

      const isCustomRole = Boolean(customOrgRole);
      const permissionBoundary = validatePrivilegeChangeOperation(
        membership.shouldUseNewPrivilegeSystem,
        OrgPermissionGroupActions.GrantPrivileges,
        OrgPermissionSubjects.Groups,
        permission,
        rolePermission
      );
      if (!permissionBoundary.isValid)
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "Failed to update group",
            membership.shouldUseNewPrivilegeSystem,
            OrgPermissionGroupActions.GrantPrivileges,
            OrgPermissionSubjects.Groups
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
      if (isCustomRole) customRole = customOrgRole;
    }

    const updatedGroup = await groupDAL.transaction(async (tx) => {
      if (name) {
        const existingGroup = await groupDAL.findOne({ orgId: actorOrgId, name }, tx);

        if (existingGroup && existingGroup.id !== id) {
          throw new BadRequestError({
            message: `Failed to update group with name '${name}'. Group with the same name already exists`
          });
        }
      }

      const [updated] = await groupDAL.update(
        {
          id: group.id
        },
        {
          name,
          slug: slug ? slugify(slug) : undefined,
          ...(role
            ? {
                role: customRole ? OrgMembershipRole.Custom : role,
                roleId: customRole?.id ?? null
              }
            : {})
        },
        tx
      );

      return updated;
    });

    return updatedGroup;
  };

  const deleteGroup = async ({ id, actor, actorId, actorAuthMethod, actorOrgId }: TDeleteGroupDTO) => {
    if (!actorOrgId) throw new UnauthorizedError({ message: "No organization ID provided in request" });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionGroupActions.Delete, OrgPermissionSubjects.Groups);

    const plan = await licenseService.getPlan(actorOrgId);

    if (!plan.groups)
      throw new BadRequestError({
        message: "Failed to delete group due to plan restriction. Upgrade plan to delete group."
      });

    const [group] = await groupDAL.delete({
      id,
      orgId: actorOrgId
    });

    return group;
  };

  const getGroupById = async ({ id, actor, actorId, actorAuthMethod, actorOrgId }: TGetGroupByIdDTO) => {
    if (!actorOrgId) throw new UnauthorizedError({ message: "No organization ID provided in request" });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionGroupActions.Read, OrgPermissionSubjects.Groups);

    const group = await groupDAL.findById(id);
    if (!group) {
      throw new NotFoundError({
        message: `Cannot find group with ID ${id}`
      });
    }

    return group;
  };

  const listGroupUsers = async ({
    id,
    offset,
    limit,
    username,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    search,
    filter
  }: TListGroupUsersDTO) => {
    if (!actorOrgId) throw new UnauthorizedError({ message: "No organization ID provided in request" });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionGroupActions.Read, OrgPermissionSubjects.Groups);

    const group = await groupDAL.findOne({
      orgId: actorOrgId,
      id
    });

    if (!group)
      throw new NotFoundError({
        message: `Failed to find group with ID ${id}`
      });

    const { members, totalCount } = await groupDAL.findAllGroupPossibleMembers({
      orgId: group.orgId,
      groupId: group.id,
      offset,
      limit,
      username,
      search,
      filter
    });

    return { users: members, totalCount };
  };

  const addUserToGroup = async ({ id, username, actor, actorId, actorAuthMethod, actorOrgId }: TAddUserToGroupDTO) => {
    if (!actorOrgId) throw new UnauthorizedError({ message: "No organization ID provided in request" });

    const { permission, membership } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionGroupActions.Edit, OrgPermissionSubjects.Groups);

    // check if group with slug exists
    const group = await groupDAL.findOne({
      orgId: actorOrgId,
      id
    });

    if (!group)
      throw new NotFoundError({
        message: `Failed to find group with ID ${id}`
      });

    const oidcConfig = await oidcConfigDAL.findOne({
      orgId: group.orgId,
      isActive: true
    });

    if (oidcConfig?.manageGroupMemberships) {
      throw new BadRequestError({
        message:
          "Cannot add user to group: OIDC group membership mapping is enabled - user must be assigned to this group in your OIDC provider."
      });
    }

    const { permission: groupRolePermission } = await permissionService.getOrgPermissionByRole(group.role, actorOrgId);

    // check if user has broader or equal to privileges than group
    const permissionBoundary = validatePrivilegeChangeOperation(
      membership.shouldUseNewPrivilegeSystem,
      OrgPermissionGroupActions.AddMembers,
      OrgPermissionSubjects.Groups,
      permission,
      groupRolePermission
    );

    if (!permissionBoundary.isValid)
      throw new PermissionBoundaryError({
        message: constructPermissionErrorMessage(
          "Failed to add user to more privileged group",
          membership.shouldUseNewPrivilegeSystem,
          OrgPermissionGroupActions.AddMembers,
          OrgPermissionSubjects.Groups
        ),
        details: { missingPermissions: permissionBoundary.missingPermissions }
      });

    const usersWithUsername = await userDAL.findUserByUsername(username);
    // akhilmhdh: case sensitive email resolution
    const user =
      usersWithUsername?.length > 1 ? usersWithUsername.find((el) => el.username === username) : usersWithUsername?.[0];
    if (!user) throw new NotFoundError({ message: `Failed to find user with username ${username}` });

    const users = await addUsersToGroupByUserIds({
      group,
      userIds: [user.id],
      userDAL,
      userGroupMembershipDAL,
      orgDAL,
      groupProjectDAL,
      projectKeyDAL,
      projectDAL,
      projectBotDAL
    });

    return users[0];
  };

  const removeUserFromGroup = async ({
    id,
    username,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TRemoveUserFromGroupDTO) => {
    if (!actorOrgId) throw new UnauthorizedError({ message: "No organization ID provided in request" });

    const { permission, membership } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionGroupActions.Edit, OrgPermissionSubjects.Groups);

    // check if group with slug exists
    const group = await groupDAL.findOne({
      orgId: actorOrgId,
      id
    });

    if (!group)
      throw new NotFoundError({
        message: `Failed to find group with ID ${id}`
      });

    const oidcConfig = await oidcConfigDAL.findOne({
      orgId: group.orgId,
      isActive: true
    });

    if (oidcConfig?.manageGroupMemberships) {
      throw new BadRequestError({
        message:
          "Cannot remove user from group: OIDC group membership mapping is enabled - user must be removed from this group in your OIDC provider."
      });
    }

    const { permission: groupRolePermission } = await permissionService.getOrgPermissionByRole(group.role, actorOrgId);

    // check if user has broader or equal to privileges than group
    const permissionBoundary = validatePrivilegeChangeOperation(
      membership.shouldUseNewPrivilegeSystem,
      OrgPermissionGroupActions.RemoveMembers,
      OrgPermissionSubjects.Groups,
      permission,
      groupRolePermission
    );
    if (!permissionBoundary.isValid)
      throw new PermissionBoundaryError({
        message: constructPermissionErrorMessage(
          "Failed to delete user from more privileged group",
          membership.shouldUseNewPrivilegeSystem,
          OrgPermissionGroupActions.RemoveMembers,
          OrgPermissionSubjects.Groups
        ),
        details: { missingPermissions: permissionBoundary.missingPermissions }
      });

    const usersWithUsername = await userDAL.findUserByUsername(username);
    // akhilmhdh: case sensitive email resolution
    const user =
      usersWithUsername?.length > 1 ? usersWithUsername.find((el) => el.username === username) : usersWithUsername?.[0];
    if (!user) throw new NotFoundError({ message: `Failed to find user with username ${username}` });

    const users = await removeUsersFromGroupByUserIds({
      group,
      userIds: [user.id],
      userDAL,
      userGroupMembershipDAL,
      groupProjectDAL,
      projectKeyDAL
    });

    return users[0];
  };

  return {
    createGroup,
    updateGroup,
    deleteGroup,
    listGroupUsers,
    addUserToGroup,
    removeUserFromGroup,
    getGroupById
  };
};
