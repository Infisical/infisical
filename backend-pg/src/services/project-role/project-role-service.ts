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

import { ActorType } from "../auth/auth-type";
import { TProjectRoleDALFactory } from "./project-role-dal";

type TProjectRoleServiceFactoryDep = {
  projectRoleDAL: TProjectRoleDALFactory;
  permissionService: Pick<
    TPermissionServiceFactory,
    "getProjectPermission" | "getUserProjectPermission"
  >;
};

export type TProjectRoleServiceFactory = ReturnType<typeof projectRoleServiceFactory>;

export const projectRoleServiceFactory = ({
  projectRoleDAL,
  permissionService
}: TProjectRoleServiceFactoryDep) => {
  const createRole = async (
    actor: ActorType,
    actorId: string,
    projectId: string,
    data: Omit<TProjectRolesInsert, "projectId">
  ) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.Role
    );
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
    data: Omit<TOrgRolesUpdate, "orgId">
  ) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      ProjectPermissionSub.Role
    );
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
    roleId: string
  ) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      ProjectPermissionSub.Role
    );
    const [deletedRole] = await projectRoleDAL.delete({ id: roleId, projectId });
    if (!deleteRole) throw new BadRequestError({ message: "Role not found", name: "Update role" });

    return deletedRole;
  };

  const listRoles = async (actor: ActorType, actorId: string, projectId: string) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.Role
    );
    const customRoles = await projectRoleDAL.find({ projectId });
    const roles = [
      {
        id: "b11b49a9-09a9-4443-916a-4246f9ff2c69", // dummy userid
        projectId,
        name: "Admin",
        slug: ProjectMembershipRole.Admin,
        description: "Complete administration access over the project",
        permissions: packRules(projectAdminPermissions.rules),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: "b11b49a9-09a9-4443-916a-4246f9ff2c70", // dummy user for zod validation in response
        projectId,
        name: "Developer",
        slug: ProjectMembershipRole.Member,
        description: "Non-administrative role in an project",
        permissions: packRules(projectMemberPermissions.rules),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: "b11b49a9-09a9-4443-916a-4246f9ff2c71", // dummy user for zod validation in response
        projectId,
        name: "Viewer",
        slug: ProjectMembershipRole.Viewer,
        description: "Non-administrative role in an project",
        permissions: packRules(projectViewerPermission.rules),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: "b11b49a9-09a9-4443-916a-4246f9ff2c72", // dummy user for zod validation in response
        projectId,
        name: "No Access",
        slug: "no-access",
        description: "No access to any resources in the project",
        permissions: packRules(projectNoAccessPermissions.rules),
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

  const getUserPermission = async (userId: string, projectId: string) => {
    const { permission, membership } = await permissionService.getUserProjectPermission(
      userId,
      projectId
    );
    return { permissions: packRules(permission.rules), membership };
  };

  return { createRole, updateRole, deleteRole, listRoles, getUserPermission };
};
