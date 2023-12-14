import { ProjectMembershipRole, TOrgRolesUpdate, TProjectRolesInsert } from "@app/db/schemas";
import {
  OrgPermissionActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import {
  projectAdminPermissions,
  projectMemberPermissions,
  projectNoAccessPermissions,
  projectViewerPermission
} from "@app/ee/services/permission/project-permission";
import { BadRequestError } from "@app/lib/errors";

import { ActorType } from "../auth/auth-type";
import { TProjectRoleDalFactory } from "./project-role-dal";

import { ForbiddenError } from "@casl/ability";
import { packRules } from "@casl/ability/extra";

type TProjectRoleServiceFactoryDep = {
  projectRoleDal: TProjectRoleDalFactory;
  permissionService: Pick<
    TPermissionServiceFactory,
    "getProjectPermission" | "getUserOrgPermission"
  >;
};

export type TProjectRoleServiceFactory = ReturnType<typeof projectRoleServiceFactory>;

export const projectRoleServiceFactory = ({
  projectRoleDal,
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
      OrgPermissionActions.Create,
      OrgPermissionSubjects.Role
    );
    const existingRole = await projectRoleDal.findOne({ slug: data.slug, projectId });
    if (existingRole) throw new BadRequestError({ name: "Create Role", message: "Duplicate role" });
    const role = await projectRoleDal.create({
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
      OrgPermissionActions.Edit,
      OrgPermissionSubjects.Role
    );
    if (data?.slug) {
      const existingRole = await projectRoleDal.findOne({ slug: data.slug, projectId });
      if (existingRole && existingRole.id !== roleId)
        throw new BadRequestError({ name: "Update Role", message: "Duplicate role" });
    }
    const [updatedRole] = await projectRoleDal.update({ id: roleId, projectId }, { ...data });
    if (!updateRole) throw new BadRequestError({ message: "Role not found", name: "Update role" });
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
      OrgPermissionActions.Delete,
      OrgPermissionSubjects.Role
    );
    const [deletedRole] = await projectRoleDal.delete({ id: roleId, projectId });
    if (!deleteRole) throw new BadRequestError({ message: "Role not found", name: "Update role" });

    return deletedRole;
  };

  const listRoles = async (actor: ActorType, actorId: string, projectId: string) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Read,
      OrgPermissionSubjects.Role
    );
    const customRoles = await projectRoleDal.find({ projectId });
    const roles = [
      {
        id: "b11b49a9-09a9-4443-916a-4246f9ff2c69", // dummy userid
        projectId,
        name: "Admin",
        slug: ProjectMembershipRole.Admin,
        description: "Complete administration access over the organization",
        permissions: packRules(projectAdminPermissions.rules),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: "b11b49a9-09a9-4443-916a-4246f9ff2c70", // dummy user for zod validation in response
        projectId,
        name: "Developer",
        slug: ProjectMembershipRole.Member,
        description: "Non-administrative role in an organization",
        permissions: packRules(projectMemberPermissions.rules),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: "b11b49a9-09a9-4443-916a-4246f9ff2c71", // dummy user for zod validation in response
        projectId,
        name: "Viewer",
        slug: ProjectMembershipRole.Viewer,
        description: "Non-administrative role in an organization",
        permissions: packRules(projectViewerPermission.rules),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: "b11b49a9-09a9-4443-916a-4246f9ff2c72", // dummy user for zod validation in response
        projectId,
        name: "No Access",
        slug: "no-access",
        description: "No access to any resources in the organization",
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

  const getUserPermission = async (userId: string, orgId: string) => {
    const { permission, membership } = await permissionService.getUserOrgPermission(userId, orgId);
    return { permissions: packRules(permission.rules), membership };
  };

  return { createRole, updateRole, deleteRole, listRoles, getUserPermission };
};
