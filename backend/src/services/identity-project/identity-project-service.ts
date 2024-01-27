import { ForbiddenError } from "@casl/ability";

import { ProjectMembershipRole, TProjectRoles } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { isAtLeastAsPrivileged } from "@app/lib/casl";
import { BadRequestError, ForbiddenRequestError } from "@app/lib/errors";

import { ActorType } from "../auth/auth-type";
import { TIdentityOrgDALFactory } from "../identity/identity-org-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { TIdentityProjectDALFactory } from "./identity-project-dal";
import {
  TCreateProjectIdentityDTO,
  TDeleteProjectIdentityDTO,
  TListProjectIdentityDTO,
  TUpdateProjectIdentityDTO
} from "./identity-project-types";

type TIdentityProjectServiceFactoryDep = {
  identityProjectDAL: TIdentityProjectDALFactory;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  identityOrgMembershipDAL: Pick<TIdentityOrgDALFactory, "findOne">;
  permissionService: Pick<
    TPermissionServiceFactory,
    "getProjectPermission" | "getProjectPermissionByRole"
  >;
};

export type TIdentityProjectServiceFactory = ReturnType<typeof identityProjectServiceFactory>;

export const identityProjectServiceFactory = ({
  identityProjectDAL,
  permissionService,
  identityOrgMembershipDAL,
  projectDAL
}: TIdentityProjectServiceFactoryDep) => {
  const createProjectIdentity = async ({
    identityId,
    actor,
    actorId,
    projectId,
    role
  }: TCreateProjectIdentityDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.Identity
    );

    const existingIdentity = await identityProjectDAL.findOne({ identityId, projectId });
    if (existingIdentity)
      throw new BadRequestError({
        message: `Identity with id ${identityId} already exists in project with id ${projectId}`
      });

    const project = await projectDAL.findById(projectId);
    const identityOrgMembership = await identityOrgMembershipDAL.findOne({
      identityId,
      orgId: project.orgId
    });
    if (!identityOrgMembership)
      throw new BadRequestError({
        message: `Failed to find identity with id ${identityId}`
      });

    const { permission: rolePermission, role: customRole } =
      await permissionService.getProjectPermissionByRole(role, project.id);
    const hasPriviledge = isAtLeastAsPrivileged(permission, rolePermission);
    if (!hasPriviledge)
      throw new ForbiddenRequestError({
        message: "Failed to add identity to project with more privileged role"
      });
    const isCustomRole = Boolean(customRole);

    const projectIdentity = await identityProjectDAL.create({
      identityId,
      projectId: project.id,
      role: isCustomRole ? ProjectMembershipRole.Custom : role,
      roleId: customRole?.id
    });
    return projectIdentity;
  };

  const updateProjectIdentity = async ({
    projectId,
    identityId,
    role,
    actor,
    actorId
  }: TUpdateProjectIdentityDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      ProjectPermissionSub.Identity
    );

    const projectIdentity = await identityProjectDAL.findOne({ identityId, projectId });
    if (!projectIdentity)
      throw new BadRequestError({
        message: `Identity with id ${identityId} doesn't exists in project with id ${projectId}`
      });

    const { permission: identityRolePermission } = await permissionService.getProjectPermission(
      ActorType.IDENTITY,
      projectIdentity.identityId,
      projectIdentity.projectId
    );
    const hasRequiredPriviledges = isAtLeastAsPrivileged(permission, identityRolePermission);
    if (!hasRequiredPriviledges)
      throw new ForbiddenRequestError({ message: "Failed to delete more privileged identity" });

    let customRole: TProjectRoles | undefined;
    if (role) {
      const { permission: rolePermission, role: customOrgRole } =
        await permissionService.getProjectPermissionByRole(role, projectIdentity.projectId);

      const isCustomRole = Boolean(customOrgRole);
      const hasRequiredNewRolePermission = isAtLeastAsPrivileged(permission, rolePermission);
      if (!hasRequiredNewRolePermission)
        throw new BadRequestError({ message: "Failed to create a more privileged identity" });
      if (isCustomRole) customRole = customOrgRole;
    }

    const [updatedProjectIdentity] = await identityProjectDAL.update(
      { projectId, identityId: projectIdentity.identityId },
      {
        role: customRole ? ProjectMembershipRole.Custom : role,
        roleId: customRole ? customRole.id : null
      }
    );
    return updatedProjectIdentity;
  };

  const deleteProjectIdentity = async ({
    identityId,
    actorId,
    actor,
    projectId
  }: TDeleteProjectIdentityDTO) => {
    const identityProjectMembership = await identityProjectDAL.findOne({ identityId, projectId });
    if (!identityProjectMembership)
      throw new BadRequestError({ message: `Failed to find identity with id ${identityId}` });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      identityProjectMembership.projectId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      ProjectPermissionSub.Identity
    );
    const { permission: identityRolePermission } = await permissionService.getProjectPermission(
      ActorType.IDENTITY,
      identityId,
      identityProjectMembership.projectId
    );
    const hasRequiredPriviledges = isAtLeastAsPrivileged(permission, identityRolePermission);
    if (!hasRequiredPriviledges)
      throw new ForbiddenRequestError({ message: "Failed to delete more privileged identity" });

    const [deletedIdentity] = await identityProjectDAL.delete({ identityId });
    return deletedIdentity;
  };

  const listProjectIdentities = async ({ projectId, actor, actorId }: TListProjectIdentityDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.Identity
    );

    const identityMemberhips = await identityProjectDAL.findByProjectId(projectId);
    return identityMemberhips;
  };

  return {
    createProjectIdentity,
    updateProjectIdentity,
    deleteProjectIdentity,
    listProjectIdentities
  };
};
