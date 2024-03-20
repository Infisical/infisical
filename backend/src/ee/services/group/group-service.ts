import { ForbiddenError } from "@casl/ability";

import { OrgMembershipRole, TOrgRoles } from "@app/db/schemas";
import { isAtLeastAsPrivileged } from "@app/lib/casl";
import { BadRequestError, ForbiddenRequestError } from "@app/lib/errors";

import { TOrgDALFactory } from "../../../services/org/org-dal";
import { TUserDALFactory } from "../../../services/user/user-dal";
import { TLicenseServiceFactory } from "../license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service";
import { TGroupDALFactory } from "./group-dal";
import {
  TCreateGroupDTO,
  TCreateGroupUserMembershipDTO,
  TDeleteGroupDTO,
  TDeleteGroupUserMembershipDTO,
  TGetGroupUserMembershipsDTO,
  TUpdateGroupDTO
} from "./group-types";
import { TUserGroupMembershipDALFactory } from "./user-group-membership-dal";

type TGroupServiceFactoryDep = {
  // TODO: Pick
  userDAL: TUserDALFactory;
  groupDAL: TGroupDALFactory;
  orgDAL: TOrgDALFactory;
  userGroupMembershipDAL: TUserGroupMembershipDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getOrgPermissionByRole">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TGroupServiceFactory = ReturnType<typeof groupServiceFactory>;

export const groupServiceFactory = ({
  userDAL,
  groupDAL,
  orgDAL,
  userGroupMembershipDAL,
  permissionService,
  licenseService
}: TGroupServiceFactoryDep) => {
  const createGroup = async ({
    name,
    slug,
    role,
    actor,
    actorId,
    orgId,
    actorAuthMethod,
    actorOrgId
  }: TCreateGroupDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Groups);

    const plan = await licenseService.getPlan(orgId);
    if (!plan.groups)
      throw new BadRequestError({
        message: "Failed to create group due to plan restriction. Upgrade plan to create group."
      });

    const { permission: rolePermission, role: customRole } = await permissionService.getOrgPermissionByRole(
      role,
      orgId
    );
    const isCustomRole = Boolean(customRole);
    const hasRequiredPriviledges = isAtLeastAsPrivileged(permission, rolePermission);
    if (!hasRequiredPriviledges) throw new BadRequestError({ message: "Failed to create a more privileged group" });

    const group = await groupDAL.create({
      name,
      slug, // TODO: slugify
      orgId,
      role: isCustomRole ? OrgMembershipRole.Custom : role,
      roleId: customRole?.id
    });

    return group;
  };

  const updateGroup = async ({
    currentSlug,
    name,
    slug,
    role,
    actor,
    actorId,
    orgId,
    actorAuthMethod,
    actorOrgId
  }: TUpdateGroupDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Groups);

    const plan = await licenseService.getPlan(orgId);
    if (!plan.groups)
      throw new BadRequestError({
        message: "Failed to update group due to plan restrictio Upgrade plan to update group."
      });

    const group = await groupDAL.findOne({ orgId, slug: currentSlug });
    if (!group) throw new BadRequestError({ message: `Failed to find group with slug ${currentSlug}` });

    let customRole: TOrgRoles | undefined;
    if (role) {
      const { permission: rolePermission, role: customOrgRole } = await permissionService.getOrgPermissionByRole(
        role,
        group.orgId
      );

      const isCustomRole = Boolean(customOrgRole);
      const hasRequiredNewRolePermission = isAtLeastAsPrivileged(permission, rolePermission);
      if (!hasRequiredNewRolePermission)
        throw new BadRequestError({ message: "Failed to create a more privileged group" });
      if (isCustomRole) customRole = customOrgRole;
    }

    const [updatedGroup] = await groupDAL.update(
      {
        orgId,
        slug: currentSlug
      },
      {
        name,
        slug, // TODO: slugify
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

  const deleteGroup = async ({ groupSlug, actor, actorId, orgId, actorAuthMethod, actorOrgId }: TDeleteGroupDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.Groups);

    const plan = await licenseService.getPlan(orgId);

    if (!plan.groups)
      throw new BadRequestError({
        message: "Failed to delete group due to plan restriction. Upgrade plan to delete group."
      });

    const [group] = await groupDAL.delete({
      orgId,
      slug: groupSlug
    });

    return group;
  };

  const listGroupUsers = async ({
    groupSlug,
    actor,
    actorId,
    orgId,
    actorAuthMethod,
    actorOrgId
  }: TGetGroupUserMembershipsDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Groups);

    const group = await groupDAL.findOne({
      orgId,
      slug: groupSlug
    });

    if (!group)
      throw new BadRequestError({
        message: `Failed to find group with slug ${groupSlug}`
      });

    const users = await groupDAL.findAllGroupMembers(group.orgId, group.id);
    return users;
  };

  const addUserToGroup = async ({
    groupSlug,
    username,
    actor,
    actorId,
    orgId,
    actorAuthMethod,
    actorOrgId
  }: TCreateGroupUserMembershipDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Groups);

    // check if group with slug exists
    const group = await groupDAL.findOne({
      orgId,
      slug: groupSlug
    });

    if (!group)
      throw new BadRequestError({
        message: `Failed to find group with slug ${groupSlug}`
      });

    const { permission: groupRolePermission } = await permissionService.getOrgPermissionByRole(group.role, orgId);

    // check if user has broader or equal to privileges than group
    const hasRequiredPriviledges = isAtLeastAsPrivileged(permission, groupRolePermission);
    if (!hasRequiredPriviledges)
      throw new ForbiddenRequestError({ message: "Failed to add user to more privileged group" });

    // get user with username
    const user = await userDAL.findOne({
      username
    });

    if (!user)
      throw new BadRequestError({
        message: `Failed to find user with username ${username}`
      });

    // check if user group membership already exists
    const existingUserGroupMembership = await userGroupMembershipDAL.findOne({
      groupId: group.id,
      userId: user.id
    });

    if (existingUserGroupMembership)
      throw new BadRequestError({
        message: `User ${username} is already part of the group ${groupSlug}`
      });

    // check if user is even part of the organization
    const existingUserOrgMembership = await orgDAL.findMembership({
      userId: user.id,
      orgId
    });

    if (!existingUserOrgMembership)
      throw new BadRequestError({
        message: `User ${username} is not part of the organization`
      });

    await userGroupMembershipDAL.create({
      userId: user.id,
      groupId: group.id
    });

    return user;
  };

  const removeUserFromGroup = async ({
    groupSlug,
    username,
    actor,
    actorId,
    orgId,
    actorAuthMethod,
    actorOrgId
  }: TDeleteGroupUserMembershipDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Groups);

    // check if group with slug exists
    const group = await groupDAL.findOne({
      orgId,
      slug: groupSlug
    });

    if (!group)
      throw new BadRequestError({
        message: `Failed to find group with slug ${groupSlug}`
      });

    const { permission: groupRolePermission } = await permissionService.getOrgPermissionByRole(group.role, orgId);

    // check if user has broader or equal to privileges than group
    const hasRequiredPriviledges = isAtLeastAsPrivileged(permission, groupRolePermission);
    if (!hasRequiredPriviledges)
      throw new ForbiddenRequestError({ message: "Failed to delete user from more privileged group" });

    const user = await userDAL.findOne({
      username
    });

    if (!user)
      throw new BadRequestError({
        message: `Failed to find user with username ${username}`
      });

    // check if user group membership already exists
    const existingUserGroupMembership = await userGroupMembershipDAL.findOne({
      groupId: group.id,
      userId: user.id
    });

    if (!existingUserGroupMembership)
      throw new BadRequestError({
        message: `User ${username} is not part of the group ${groupSlug}`
      });

    await userGroupMembershipDAL.delete({
      groupId: group.id,
      userId: user.id
    });

    return user;
  };

  return {
    createGroup,
    updateGroup,
    deleteGroup,
    listGroupUsers,
    addUserToGroup,
    removeUserFromGroup
  };
};
