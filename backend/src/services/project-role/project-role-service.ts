import { ForbiddenError, MongoAbility, RawRuleOf } from "@casl/ability";
import { PackRule, packRules, unpackRules } from "@casl/ability/extra";

import { ProjectMembershipRole } from "@app/db/schemas";
import { UnpackedPermissionSchema } from "@app/ee/services/identity-project-additional-privilege/identity-project-additional-privilege-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import {
  projectAdminPermissions,
  projectMemberPermissions,
  projectNoAccessPermissions,
  ProjectPermissionActions,
  ProjectPermissionSet,
  ProjectPermissionSub,
  projectViewerPermission
} from "@app/ee/services/permission/project-permission";
import { BadRequestError } from "@app/lib/errors";

import { ActorAuthMethod } from "../auth/auth-type";
import { TIdentityProjectMembershipRoleDALFactory } from "../identity-project/identity-project-membership-role-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { TProjectUserMembershipRoleDALFactory } from "../project-membership/project-user-membership-role-dal";
import { TProjectRoleDALFactory } from "./project-role-dal";
import { TCreateRoleDTO, TDeleteRoleDTO, TGetRoleBySlugDTO, TListRolesDTO, TUpdateRoleDTO } from "./project-role-types";

type TProjectRoleServiceFactoryDep = {
  projectRoleDAL: TProjectRoleDALFactory;
  projectDAL: Pick<TProjectDALFactory, "findProjectBySlug">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getUserProjectPermission">;
  identityProjectMembershipRoleDAL: TIdentityProjectMembershipRoleDALFactory;
  projectUserMembershipRoleDAL: TProjectUserMembershipRoleDALFactory;
};

export type TProjectRoleServiceFactory = ReturnType<typeof projectRoleServiceFactory>;

const unpackPermissions = (permissions: unknown) =>
  UnpackedPermissionSchema.array().parse(
    unpackRules((permissions || []) as PackRule<RawRuleOf<MongoAbility<ProjectPermissionSet>>>[])
  );

const getPredefinedRoles = (projectId: string, roleFilter?: ProjectMembershipRole) => {
  return [
    {
      id: "b11b49a9-09a9-4443-916a-4246f9ff2c69", // dummy userid
      projectId,
      name: "Admin",
      slug: ProjectMembershipRole.Admin,
      permissions: projectAdminPermissions,
      description: "Full administrative access over a project",
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: "b11b49a9-09a9-4443-916a-4246f9ff2c70", // dummy user for zod validation in response
      projectId,
      name: "Developer",
      slug: ProjectMembershipRole.Member,
      permissions: projectMemberPermissions,
      description: "Limited read/write role in a project",
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: "b11b49a9-09a9-4443-916a-4246f9ff2c71", // dummy user for zod validation in response
      projectId,
      name: "Viewer",
      slug: ProjectMembershipRole.Viewer,
      permissions: projectViewerPermission,
      description: "Only read role in a project",
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: "b11b49a9-09a9-4443-916a-4246f9ff2c72", // dummy user for zod validation in response
      projectId,
      name: "No Access",
      slug: ProjectMembershipRole.NoAccess,
      permissions: projectNoAccessPermissions,
      description: "No access to any resources in the project",
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ].filter(({ slug }) => !roleFilter || roleFilter.includes(slug));
};

export const projectRoleServiceFactory = ({
  projectRoleDAL,
  permissionService,
  identityProjectMembershipRoleDAL,
  projectUserMembershipRoleDAL,
  projectDAL
}: TProjectRoleServiceFactoryDep) => {
  const createRole = async ({ projectSlug, data, actor, actorId, actorAuthMethod, actorOrgId }: TCreateRoleDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new BadRequestError({ message: "Project not found" });
    const projectId = project.id;

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
      projectId
    });
    return { ...role, permissions: unpackPermissions(role.permissions) };
  };

  const getRoleBySlug = async ({
    actor,
    actorId,
    projectSlug,
    actorAuthMethod,
    actorOrgId,
    roleSlug
  }: TGetRoleBySlugDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new BadRequestError({ message: "Project not found" });
    const projectId = project.id;

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Role);
    if (roleSlug !== "custom" && Object.values(ProjectMembershipRole).includes(roleSlug as ProjectMembershipRole)) {
      const predefinedRole = getPredefinedRoles(projectId, roleSlug as ProjectMembershipRole)[0];
      return { ...predefinedRole, permissions: UnpackedPermissionSchema.array().parse(predefinedRole.permissions) };
    }

    const customRole = await projectRoleDAL.findOne({ slug: roleSlug, projectId });
    if (!customRole) throw new BadRequestError({ message: "Role not found" });
    return { ...customRole, permissions: unpackPermissions(customRole.permissions) };
  };

  const updateRole = async ({
    roleId,
    projectSlug,
    actorOrgId,
    actorAuthMethod,
    actorId,
    actor,
    data
  }: TUpdateRoleDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new BadRequestError({ message: "Project not found" });
    const projectId = project.id;

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
      {
        ...data,
        permissions: data.permissions ? data.permissions : undefined
      }
    );
    if (!updatedRole) throw new BadRequestError({ message: "Role not found", name: "Update role" });
    return { ...updatedRole, permissions: unpackPermissions(updatedRole.permissions) };
  };

  const deleteRole = async ({ actor, actorId, actorAuthMethod, actorOrgId, projectSlug, roleId }: TDeleteRoleDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new BadRequestError({ message: "Project not found" });
    const projectId = project.id;

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

    return { ...deletedRole, permissions: unpackPermissions(deletedRole.permissions) };
  };

  const listRoles = async ({ projectSlug, actorOrgId, actorAuthMethod, actorId, actor }: TListRolesDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new BadRequestError({ message: "Project not found" });
    const projectId = project.id;

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Role);
    const customRoles = await projectRoleDAL.find({ projectId });
    const roles = [...getPredefinedRoles(projectId), ...(customRoles || [])];

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

  return { createRole, updateRole, deleteRole, listRoles, getUserPermission, getRoleBySlug };
};
