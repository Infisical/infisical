import { ForbiddenError, MongoAbility, RawRuleOf } from "@casl/ability";
import { PackRule, packRules, unpackRules } from "@casl/ability/extra";
import { requestContext } from "@fastify/request-context";

import { ActionProjectType, ProjectMembershipRole, ProjectType, TableName, TProjects } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { validateHandlebarTemplate } from "@app/lib/template/validate-handlebars";
import { UnpackedPermissionSchema } from "@app/server/routes/sanitizedSchema/permission";

import { ActorAuthMethod, ActorType } from "../auth/auth-type";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TIdentityProjectMembershipRoleDALFactory } from "../identity-project/identity-project-membership-role-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { TProjectUserMembershipRoleDALFactory } from "../project-membership/project-user-membership-role-dal";
import { TUserDALFactory } from "../user/user-dal";
import { TProjectRoleDALFactory } from "./project-role-dal";
import { getPredefinedRoles } from "./project-role-fns";
import {
  ProjectRoleServiceIdentifierType,
  TCreateRoleDTO,
  TDeleteRoleDTO,
  TGetRoleDetailsDTO,
  TListRolesDTO,
  TUpdateRoleDTO
} from "./project-role-types";

type TProjectRoleServiceFactoryDep = {
  projectRoleDAL: TProjectRoleDALFactory;
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  userDAL: Pick<TUserDALFactory, "findById">;
  projectDAL: Pick<TProjectDALFactory, "findProjectBySlug" | "findProjectById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getUserProjectPermission">;
  identityProjectMembershipRoleDAL: TIdentityProjectMembershipRoleDALFactory;
  projectUserMembershipRoleDAL: TProjectUserMembershipRoleDALFactory;
};

export type TProjectRoleServiceFactory = ReturnType<typeof projectRoleServiceFactory>;

const unpackPermissions = (permissions: unknown) =>
  UnpackedPermissionSchema.array().parse(
    unpackRules((permissions || []) as PackRule<RawRuleOf<MongoAbility<ProjectPermissionSet>>>[])
  );

export const projectRoleServiceFactory = ({
  projectRoleDAL,
  permissionService,
  identityProjectMembershipRoleDAL,
  projectUserMembershipRoleDAL,
  projectDAL,
  identityDAL,
  userDAL
}: TProjectRoleServiceFactoryDep) => {
  const createRole = async ({ data, actor, actorId, actorAuthMethod, actorOrgId, filter }: TCreateRoleDTO) => {
    let projectId = "";
    if (filter.type === ProjectRoleServiceIdentifierType.SLUG) {
      const project = await projectDAL.findProjectBySlug(filter.projectSlug, actorOrgId);
      if (!project) throw new NotFoundError({ message: "Project not found" });
      projectId = project.id;
    } else {
      projectId = filter.projectId;
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.Role);
    const existingRole = await projectRoleDAL.findOne({ slug: data.slug, projectId });
    if (existingRole) {
      throw new BadRequestError({ name: "Create Role", message: "Project role with same slug already exists" });
    }

    validateHandlebarTemplate("Project Role Create", JSON.stringify(data.permissions || []), {
      allowedExpressions: (val) => val.includes("identity.")
    });
    const role = await projectRoleDAL.create({
      ...data,
      projectId
    });
    return { ...role, permissions: unpackPermissions(role.permissions) };
  };

  const getRoleBySlug = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    roleSlug,
    filter
  }: TGetRoleDetailsDTO) => {
    let project: TProjects;
    if (filter.type === ProjectRoleServiceIdentifierType.SLUG) {
      project = await projectDAL.findProjectBySlug(filter.projectSlug, actorOrgId);
    } else {
      project = await projectDAL.findProjectById(filter.projectId);
    }

    if (!project) throw new NotFoundError({ message: "Project not found" });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: project.id,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Role);
    if (roleSlug !== "custom" && Object.values(ProjectMembershipRole).includes(roleSlug as ProjectMembershipRole)) {
      const [predefinedRole] = getPredefinedRoles({
        projectId: project.id,
        projectType: project.type as ProjectType,
        roleFilter: roleSlug as ProjectMembershipRole
      });

      if (!predefinedRole) throw new NotFoundError({ message: `Default role with slug '${roleSlug}' not found` });

      return { ...predefinedRole, permissions: UnpackedPermissionSchema.array().parse(predefinedRole.permissions) };
    }

    const customRole = await projectRoleDAL.findOne({ slug: roleSlug, projectId: project.id });
    if (!customRole) throw new NotFoundError({ message: `Project role with slug '${roleSlug}' not found` });
    return { ...customRole, permissions: unpackPermissions(customRole.permissions) };
  };

  const updateRole = async ({ roleId, actorOrgId, actorAuthMethod, actorId, actor, data }: TUpdateRoleDTO) => {
    const projectRole = await projectRoleDAL.findById(roleId);
    if (!projectRole) throw new NotFoundError({ message: "Project role not found", name: "Delete role" });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: projectRole.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Role);

    if (data?.slug) {
      const existingRole = await projectRoleDAL.findOne({ slug: data.slug, projectId: projectRole.projectId });
      if (existingRole && existingRole.id !== roleId)
        throw new BadRequestError({ name: "Update Role", message: "Project role with the same slug already exists" });
    }
    validateHandlebarTemplate("Project Role Update", JSON.stringify(data.permissions || []), {
      allowedExpressions: (val) => val.includes("identity.")
    });

    const updatedRole = await projectRoleDAL.updateById(projectRole.id, {
      ...data,
      permissions: data.permissions ? data.permissions : undefined
    });
    if (!updatedRole) throw new NotFoundError({ message: "Project role not found", name: "Update role" });

    return { ...updatedRole, permissions: unpackPermissions(updatedRole.permissions) };
  };

  const deleteRole = async ({ actor, actorId, actorAuthMethod, actorOrgId, roleId }: TDeleteRoleDTO) => {
    const projectRole = await projectRoleDAL.findById(roleId);
    if (!projectRole) throw new NotFoundError({ message: "Project role not found", name: "Delete role" });
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: projectRole.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
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

    const deletedRole = await projectRoleDAL.deleteById(roleId);
    if (!deletedRole) throw new NotFoundError({ message: "Project role not found", name: "Delete role" });

    return { ...deletedRole, permissions: unpackPermissions(deletedRole.permissions) };
  };

  const listRoles = async ({ actorOrgId, actorAuthMethod, actorId, actor, filter }: TListRolesDTO) => {
    let project: TProjects;
    if (filter.type === ProjectRoleServiceIdentifierType.SLUG) {
      project = await projectDAL.findProjectBySlug(filter.projectSlug, actorOrgId);
    } else {
      project = await projectDAL.findProjectById(filter.projectId);
    }

    if (!project) throw new BadRequestError({ message: "Project not found" });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: project.id,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Role);
    const customRoles = await projectRoleDAL.find(
      { projectId: project.id },
      { sort: [[`${TableName.ProjectRoles}.slug` as "slug", "asc"]] }
    );
    const roles = [
      ...getPredefinedRoles({ projectId: project.id, projectType: project.type as ProjectType }),
      ...(customRoles || [])
    ];

    return roles;
  };

  const getUserPermission = async (
    userId: string,
    projectId: string,
    actorAuthMethod: ActorAuthMethod,
    actorOrgId: string | undefined
  ) => {
    const { permission, membership } = await permissionService.getProjectPermission({
      actor: ActorType.USER,
      actorId: userId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    // just to satisfy ts
    if (!("roles" in membership)) throw new BadRequestError({ message: "Service token not allowed" });

    const assumedPrivilegeDetailsCtx = requestContext.get("assumedPrivilegeDetails");
    const isAssumingPrivilege = assumedPrivilegeDetailsCtx?.projectId === projectId;
    const assumedPrivilegeDetails = isAssumingPrivilege
      ? {
          actorId: assumedPrivilegeDetailsCtx?.actorId,
          actorType: assumedPrivilegeDetailsCtx?.actorType,
          actorName: "",
          actorEmail: ""
        }
      : undefined;

    if (assumedPrivilegeDetails?.actorType === ActorType.IDENTITY) {
      const identityDetails = await identityDAL.findById(assumedPrivilegeDetails.actorId);
      if (!identityDetails)
        throw new NotFoundError({ message: `Identity with ID ${assumedPrivilegeDetails.actorId} not found` });
      assumedPrivilegeDetails.actorName = identityDetails.name;
    } else if (assumedPrivilegeDetails?.actorType === ActorType.USER) {
      const userDetails = await userDAL.findById(assumedPrivilegeDetails?.actorId);
      if (!userDetails)
        throw new NotFoundError({ message: `User with ID ${assumedPrivilegeDetails.actorId} not found` });
      assumedPrivilegeDetails.actorName = `${userDetails?.firstName} ${userDetails?.lastName || ""}`;
      assumedPrivilegeDetails.actorEmail = userDetails?.email || "";
    }

    return { permissions: packRules(permission.rules), membership, assumedPrivilegeDetails };
  };

  return { createRole, updateRole, deleteRole, listRoles, getUserPermission, getRoleBySlug };
};
