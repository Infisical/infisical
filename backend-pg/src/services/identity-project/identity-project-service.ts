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
import { TIdentityOrgDalFactory } from "../identity/identity-org-dal";
import { TProjectDalFactory } from "../project/project-dal";
import { TIdentityProjectDalFactory } from "./identity-project-dal";
import {
  TCreateProjectIdentityDTO,
  TDeleteProjectIdentityDTO,
  TListProjectIdentityDTO,
  TUpdateProjectIdentityDTO
} from "./identity-project-types";

type TIdentityProjectServiceFactoryDep = {
  identityProjectDal: TIdentityProjectDalFactory;
  projectDal: Pick<TProjectDalFactory, "findById">;
  identityOrgMembershipDal: Pick<TIdentityOrgDalFactory, "findOne">;
  permissionService: Pick<
    TPermissionServiceFactory,
    "getProjectPermission" | "getProjectPermissionByRole"
  >;
};

export type TIdentityProjectServiceFactory = ReturnType<typeof identityProjectServiceFactory>;

export const identityProjectServiceFactory = ({
  identityProjectDal,
  permissionService,
  identityOrgMembershipDal,
  projectDal
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

    const existingIdentity = await identityProjectDal.findOne({ identityId, projectId });
    if (existingIdentity)
      throw new BadRequestError({
        message: `Identity with id ${identityId} already exists in project with id ${projectId}`
      });

    const project = await projectDal.findById(projectId);
    const identityOrgMembership = await identityOrgMembershipDal.findOne({
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

    const projectIdentity = await identityProjectDal.create({
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

    const projectIdentity = await identityProjectDal.findOne({ identityId, projectId });
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

    const [updatedProjectIdentity] = await identityProjectDal.update(
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
    actor
  }: TDeleteProjectIdentityDTO) => {
    const identityProjectMembership = await identityProjectDal.findById(identityId);
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

    const [deletedIdentity] = await identityProjectDal.delete({ identityId });
    return deletedIdentity;
  };

  const listProjectIdentities = async ({ projectId, actor, actorId }: TListProjectIdentityDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.Identity
    );

    const identityMemberhips = await identityProjectDal.find({ projectId });
    return identityMemberhips;
  };

  return {
    createProjectIdentity,
    updateProjectIdentity,
    deleteProjectIdentity,
    listProjectIdentities
  };
};
