import { ForbiddenError } from "@casl/ability";
import { packRules } from "@casl/ability/extra";

import { TOrgRolesInsert, TOrgRolesUpdate } from "@app/db/schemas";
import {
  orgAdminPermissions,
  orgMemberPermissions,
  orgNoAccessPermissions,
  OrgPermissionActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TOrgDALFactory } from "@app/services/org/org-dal";

import { ActorAuthMethod } from "../auth/auth-type";
import { TOrgRoleDALFactory } from "./org-role-dal";

type TOrgRoleServiceFactoryDep = {
  orgRoleDAL: TOrgRoleDALFactory;
  permissionService: TPermissionServiceFactory;
  orgDAL: TOrgDALFactory;
};

export type TOrgRoleServiceFactory = ReturnType<typeof orgRoleServiceFactory>;

export const orgRoleServiceFactory = ({ orgRoleDAL, orgDAL, permissionService }: TOrgRoleServiceFactoryDep) => {
  const createRole = async (
    userId: string,
    orgId: string,
    data: Omit<TOrgRolesInsert, "orgId">,
    actorAuthMethod: ActorAuthMethod,
    actorOrgId: string | undefined
  ) => {
    const { permission } = await permissionService.getUserOrgPermission(userId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Role);
    const existingRole = await orgRoleDAL.findOne({ slug: data.slug, orgId });
    if (existingRole) throw new BadRequestError({ name: "Create Role", message: "Duplicate role" });
    const role = await orgRoleDAL.create({
      ...data,
      orgId,
      permissions: JSON.stringify(data.permissions)
    });
    return role;
  };

  const getRole = async (
    userId: string,
    orgId: string,
    roleId: string,
    actorAuthMethod: ActorAuthMethod,
    actorOrgId: string | undefined
  ) => {
    const { permission } = await permissionService.getUserOrgPermission(userId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Role);

    switch (roleId) {
      case "b11b49a9-09a9-4443-916a-4246f9ff2c69": {
        return {
          id: roleId,
          orgId,
          name: "Admin",
          slug: "admin",
          description: "Complete administration access over the organization",
          permissions: packRules(orgAdminPermissions),
          createdAt: new Date(),
          updatedAt: new Date()
        };
      }
      case "b11b49a9-09a9-4443-916a-4246f9ff2c70": {
        return {
          id: roleId,
          orgId,
          name: "Member",
          slug: "member",
          description: "Non-administrative role in an organization",
          permissions: packRules(orgMemberPermissions),
          createdAt: new Date(),
          updatedAt: new Date()
        };
      }
      case "b10d49a9-09a9-4443-916a-4246f9ff2c72": {
        return {
          id: "b10d49a9-09a9-4443-916a-4246f9ff2c72", // dummy user for zod validation in response
          orgId,
          name: "No Access",
          slug: "no-access",
          description: "No access to any resources in the organization",
          permissions: packRules(orgNoAccessPermissions),
          createdAt: new Date(),
          updatedAt: new Date()
        };
      }
      default: {
        const role = await orgRoleDAL.findOne({ id: roleId, orgId });
        if (!role) throw new NotFoundError({ message: "Organization role not found" });
        return role;
      }
    }
  };

  const updateRole = async (
    userId: string,
    orgId: string,
    roleId: string,
    data: Omit<TOrgRolesUpdate, "orgId">,
    actorAuthMethod: ActorAuthMethod,
    actorOrgId: string | undefined
  ) => {
    const { permission } = await permissionService.getUserOrgPermission(userId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Role);
    if (data?.slug) {
      const existingRole = await orgRoleDAL.findOne({ slug: data.slug, orgId });
      if (existingRole && existingRole.id !== roleId)
        throw new BadRequestError({ name: "Update Role", message: "Duplicate role" });
    }
    const [updatedRole] = await orgRoleDAL.update(
      { id: roleId, orgId },
      { ...data, permissions: data.permissions ? JSON.stringify(data.permissions) : undefined }
    );
    if (!updatedRole) throw new NotFoundError({ message: "Organization role not found" });
    return updatedRole;
  };

  const deleteRole = async (
    userId: string,
    orgId: string,
    roleId: string,
    actorAuthMethod: ActorAuthMethod,
    actorOrgId: string | undefined
  ) => {
    const { permission } = await permissionService.getUserOrgPermission(userId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.Role);

    const org = await orgDAL.findOrgById(orgId);

    if (!org)
      throw new NotFoundError({
        message: "Failed to find organization"
      });

    // prevent deletion of custom role if set as default org membership role
    if (org.defaultMembershipRole === roleId)
      throw new BadRequestError({
        message: "Cannot delete default org membership role. Please re-assign and try again."
      });

    const [deletedRole] = await orgRoleDAL.delete({ id: roleId, orgId });
    if (!deletedRole) throw new NotFoundError({ message: "Organization role not found", name: "Update role" });

    return deletedRole;
  };

  const listRoles = async (
    userId: string,
    orgId: string,
    actorAuthMethod: ActorAuthMethod,
    actorOrgId: string | undefined
  ) => {
    const { permission } = await permissionService.getUserOrgPermission(userId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Role);
    const customRoles = await orgRoleDAL.find({ orgId });
    const roles = [
      {
        id: "b11b49a9-09a9-4443-916a-4246f9ff2c69", // dummy userid
        orgId,
        name: "Admin",
        slug: "admin",
        description: "Complete administration access over the organization",
        permissions: packRules(orgAdminPermissions),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: "b11b49a9-09a9-4443-916a-4246f9ff2c70", // dummy user for zod validation in response
        orgId,
        name: "Member",
        slug: "member",
        description: "Non-administrative role in an organization",
        permissions: packRules(orgMemberPermissions),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: "b10d49a9-09a9-4443-916a-4246f9ff2c72", // dummy user for zod validation in response
        orgId,
        name: "No Access",
        slug: "no-access",
        description: "No access to any resources in the organization",
        permissions: packRules(orgNoAccessPermissions),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      ...(customRoles || []).map(({ permissions, ...data }) => ({
        ...data,
        permissions
      }))
    ];

    return roles;
  };

  const getUserPermission = async (
    userId: string,
    orgId: string,
    actorAuthMethod: ActorAuthMethod,
    actorOrgId: string | undefined
  ) => {
    const { permission, membership } = await permissionService.getUserOrgPermission(
      userId,
      orgId,
      actorAuthMethod,
      actorOrgId
    );
    return { permissions: packRules(permission.rules), membership };
  };

  return { createRole, getRole, updateRole, deleteRole, listRoles, getUserPermission };
};
