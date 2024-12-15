import { ForbiddenError } from "@casl/ability";
import slugify from "@sindresorhus/slugify";

import { OrgMembershipRole, TOrgRoles } from "@app/db/schemas";
import { isAtLeastAsPrivileged } from "@app/lib/casl";
import { BadRequestError, ForbiddenRequestError, NotFoundError, UnauthorizedError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { TGroupProjectDALFactory } from "@app/services/group-project/group-project-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectBotDALFactory } from "@app/services/project-bot/project-bot-dal";
import { TProjectKeyDALFactory } from "@app/services/project-key/project-key-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TLicenseServiceFactory } from "../license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "../permission/org-permission";
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
  userDAL: Pick<TUserDALFactory, "find" | "findUserEncKeyByUserIdsBatch" | "transaction" | "findOne">;
  groupDAL: Pick<
    TGroupDALFactory,
    "create" | "findOne" | "update" | "delete" | "findAllGroupPossibleMembers" | "findById"
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
  licenseService
}: TGroupServiceFactoryDep) => {
  const createGroup = async ({ name, slug, role, actor, actorId, actorAuthMethod, actorOrgId }: TCreateGroupDTO) => {
    if (!actorOrgId) throw new UnauthorizedError({ message: "No organization ID provided in request" });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Groups);

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
    const hasRequiredPriviledges = isAtLeastAsPrivileged(permission, rolePermission);
    if (!hasRequiredPriviledges)
      throw new ForbiddenRequestError({ message: "Failed to create a more privileged group" });

    const group = await groupDAL.create({
      name,
      slug: slug || slugify(`${name}-${alphaNumericNanoId(4)}`),
      orgId: actorOrgId,
      role: isCustomRole ? OrgMembershipRole.Custom : role,
      roleId: customRole?.id
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

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Groups);

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
      const hasRequiredNewRolePermission = isAtLeastAsPrivileged(permission, rolePermission);
      if (!hasRequiredNewRolePermission)
        throw new ForbiddenRequestError({ message: "Failed to create a more privileged group" });
      if (isCustomRole) customRole = customOrgRole;
    }

    const [updatedGroup] = await groupDAL.update(
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
      }
    );

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
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.Groups);

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
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Groups);

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
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Groups);

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

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Groups);

    // check if group with slug exists
    const group = await groupDAL.findOne({
      orgId: actorOrgId,
      id
    });

    if (!group)
      throw new NotFoundError({
        message: `Failed to find group with ID ${id}`
      });

    const { permission: groupRolePermission } = await permissionService.getOrgPermissionByRole(group.role, actorOrgId);

    // check if user has broader or equal to privileges than group
    const hasRequiredPrivileges = isAtLeastAsPrivileged(permission, groupRolePermission);
    if (!hasRequiredPrivileges)
      throw new ForbiddenRequestError({ message: "Failed to add user to more privileged group" });

    const user = await userDAL.findOne({ username });
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

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Groups);

    // check if group with slug exists
    const group = await groupDAL.findOne({
      orgId: actorOrgId,
      id
    });

    if (!group)
      throw new NotFoundError({
        message: `Failed to find group with ID ${id}`
      });

    const { permission: groupRolePermission } = await permissionService.getOrgPermissionByRole(group.role, actorOrgId);

    // check if user has broader or equal to privileges than group
    const hasRequiredPrivileges = isAtLeastAsPrivileged(permission, groupRolePermission);
    if (!hasRequiredPrivileges)
      throw new ForbiddenRequestError({ message: "Failed to delete user from more privileged group" });

    const user = await userDAL.findOne({ username });
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
