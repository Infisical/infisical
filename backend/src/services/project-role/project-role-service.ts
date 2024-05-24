import { ForbiddenError } from "@casl/ability";
import { packRules } from "@casl/ability/extra";

import { ProjectMembershipRole, TOrgRolesUpdate, TProjectRolesInsert } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import {
  projectAdminPermissions,
  projectMemberPermissions,
  projectNoAccessPermissions,
  ProjectPermissionActions,
  ProjectPermissionSub,
  projectViewerPermission
} from "@app/ee/services/permission/project-permission";
import { BadRequestError } from "@app/lib/errors";

import { ActorAuthMethod, ActorType } from "../auth/auth-type";
import { TIdentityProjectMembershipRoleDALFactory } from "../identity-project/identity-project-membership-role-dal";
import { TProjectUserMembershipRoleDALFactory } from "../project-membership/project-user-membership-role-dal";
import { TProjectRoleDALFactory } from "./project-role-dal";

type TProjectRoleServiceFactoryDep = {
  projectRoleDAL: TProjectRoleDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getUserProjectPermission">;
  identityProjectMembershipRoleDAL: TIdentityProjectMembershipRoleDALFactory;
  projectUserMembershipRoleDAL: TProjectUserMembershipRoleDALFactory;
};

export type TProjectRoleServiceFactory = ReturnType<typeof projectRoleServiceFactory>;

export const projectRoleServiceFactory = ({
  projectRoleDAL,
  permissionService,
  identityProjectMembershipRoleDAL,
  projectUserMembershipRoleDAL
}: TProjectRoleServiceFactoryDep) => {
  const createRole = async (
    actor: ActorType,
    actorId: string,
    projectId: string,
    data: Omit<TProjectRolesInsert, "projectId">,
    actorAuthMethod: ActorAuthMethod,
    actorOrgId: string | undefined
  ) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.Role);
    const existingRole = await projectRoleDAL.findOne({ slug: data.slug, projectId });
    if (existingRole) throw new BadRequestError({ name: "Create Role", message: "Duplicate role" });
    const role = await projectRoleDAL.create({
      ...data,
      projectId,
      permissions: JSON.stringify(data.permissions)
    });
    return role;
  };

  const updateRole = async (
    actor: ActorType,
    actorId: string,
    projectId: string,
    roleId: string,
    data: Omit<TOrgRolesUpdate, "orgId">,
    actorAuthMethod: ActorAuthMethod,
    actorOrgId: string | undefined
  ) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Role);
    if (data?.slug) {
      const existingRole = await projectRoleDAL.findOne({ slug: data.slug, projectId });
      if (existingRole && existingRole.id !== roleId)
        throw new BadRequestError({ name: "Update Role", message: "Duplicate role" });
    }
    const [updatedRole] = await projectRoleDAL.update(
      { id: roleId, projectId },
      { ...data, permissions: data.permissions ? JSON.stringify(data.permissions) : undefined }
    );
    if (!updatedRole) throw new BadRequestError({ message: "Role not found", name: "Update role" });
    return updatedRole;
  };

  const deleteRole = async (
    actor: ActorType,
    actorId: string,
    projectId: string,
    roleId: string,
    actorAuthMethod: ActorAuthMethod,
    actorOrgId: string | undefined
  ) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.Role);

    const identityRole = await identityProjectMembershipRoleDAL.findOne({ customRoleId: roleId });
    const projectUserRole = await projectUserMembershipRoleDAL.findOne({ customRoleId: roleId });

    if (identityRole) {
      throw new BadRequestError({
        message: "The role is assigned to one or more identities. Make sure to unassign them before deleting the role.",
        name: "Delete role"
      });
    }
    if (projectUserRole) {
      throw new BadRequestError({
        message: "The role is assigned to one or more users. Make sure to unassign them before deleting the role.",
        name: "Delete role"
      });
    }

    const [deletedRole] = await projectRoleDAL.delete({ id: roleId, projectId });
    if (!deletedRole) throw new BadRequestError({ message: "Role not found", name: "Delete role" });

    return deletedRole;
  };

  const listRoles = async (
    actor: ActorType,
    actorId: string,
    projectId: string,
    actorAuthMethod: ActorAuthMethod,
    actorOrgId: string | undefined
  ) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Role);
    const customRoles = await projectRoleDAL.find({ projectId });
    const roles = [
      {
        id: "b11b49a9-09a9-4443-916a-4246f9ff2c69", // dummy userid
        projectId,
        name: "Admin",
        slug: ProjectMembershipRole.Admin,
        description: "Complete administration access over the project",
        permissions: packRules(projectAdminPermissions),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: "b11b49a9-09a9-4443-916a-4246f9ff2c70", // dummy user for zod validation in response
        projectId,
        name: "Developer",
        slug: ProjectMembershipRole.Member,
        description: "Non-administrative role in an project",
        permissions: packRules(projectMemberPermissions),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: "b11b49a9-09a9-4443-916a-4246f9ff2c71", // dummy user for zod validation in response
        projectId,
        name: "Viewer",
        slug: ProjectMembershipRole.Viewer,
        description: "Non-administrative role in an project",
        permissions: packRules(projectViewerPermission),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: "b11b49a9-09a9-4443-916a-4246f9ff2c72", // dummy user for zod validation in response
        projectId,
        name: "No Access",
        slug: "no-access",
        description: "No access to any resources in the project",
        permissions: packRules(projectNoAccessPermissions),
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
    projectId: string,
    actorAuthMethod: ActorAuthMethod,
    actorOrgId: string | undefined
  ) => {
    const { permission, membership } = await permissionService.getUserProjectPermission(
      userId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    return { permissions: packRules(permission.rules), membership };
  };

  return { createRole, updateRole, deleteRole, listRoles, getUserPermission };
};
