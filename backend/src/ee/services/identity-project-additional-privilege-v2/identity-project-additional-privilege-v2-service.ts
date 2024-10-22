import { ForbiddenError } from "@casl/ability";
import ms from "ms";

import { isAtLeastAsPrivileged } from "@app/lib/casl";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { unpackPermissions } from "@app/server/routes/santizedSchemas/permission";
import { ActorType } from "@app/services/auth/auth-type";
import { TIdentityProjectDALFactory } from "@app/services/identity-project/identity-project-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TPermissionServiceFactory } from "../permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "../permission/project-permission";
import { TIdentityProjectAdditionalPrivilegeV2DALFactory } from "./identity-project-additional-privilege-v2-dal";
import {
  IdentityProjectAdditionalPrivilegeTemporaryMode,
  TCreateIdentityPrivilegeDTO,
  TDeleteIdentityPrivilegeByIdDTO,
  TGetIdentityPrivilegeDetailsByIdDTO,
  TGetIdentityPrivilegeDetailsBySlugDTO,
  TListIdentityPrivilegesDTO,
  TUpdateIdentityPrivilegeByIdDTO
} from "./identity-project-additional-privilege-v2-types";

type TIdentityProjectAdditionalPrivilegeV2ServiceFactoryDep = {
  identityProjectAdditionalPrivilegeDAL: TIdentityProjectAdditionalPrivilegeV2DALFactory;
  identityProjectDAL: Pick<TIdentityProjectDALFactory, "findOne" | "findById">;
  projectDAL: Pick<TProjectDALFactory, "findProjectBySlug">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TIdentityProjectAdditionalPrivilegeV2ServiceFactory = ReturnType<
  typeof identityProjectAdditionalPrivilegeV2ServiceFactory
>;

export const identityProjectAdditionalPrivilegeV2ServiceFactory = ({
  identityProjectAdditionalPrivilegeDAL,
  identityProjectDAL,
  projectDAL,
  permissionService
}: TIdentityProjectAdditionalPrivilegeV2ServiceFactoryDep) => {
  const create = async ({
    slug,
    actor,
    actorId,
    projectId,
    actorOrgId,
    identityId,
    permissions: customPermission,
    actorAuthMethod,
    ...dto
  }: TCreateIdentityPrivilegeDTO) => {
    const identityProjectMembership = await identityProjectDAL.findOne({ identityId, projectId });
    if (!identityProjectMembership)
      throw new NotFoundError({ message: `Failed to find identity with id ${identityId}` });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      identityProjectMembership.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Identity);
    const { permission: identityRolePermission } = await permissionService.getProjectPermission(
      ActorType.IDENTITY,
      identityId,
      identityProjectMembership.projectId,
      actorAuthMethod,
      actorOrgId
    );
    const hasRequiredPriviledges = isAtLeastAsPrivileged(permission, identityRolePermission);
    if (!hasRequiredPriviledges)
      throw new ForbiddenRequestError({ message: "Failed to update more privileged identity" });

    const existingSlug = await identityProjectAdditionalPrivilegeDAL.findOne({
      slug,
      projectMembershipId: identityProjectMembership.id
    });
    if (existingSlug) throw new BadRequestError({ message: "Additional privilege with provided slug already exists" });

    if (!dto.isTemporary) {
      const additionalPrivilege = await identityProjectAdditionalPrivilegeDAL.create({
        projectMembershipId: identityProjectMembership.id,
        slug,
        permissions: customPermission
      });

      return {
        ...additionalPrivilege,
        permissions: unpackPermissions(additionalPrivilege.permissions)
      };
    }

    const relativeTempAllocatedTimeInMs = ms(dto.temporaryRange);
    const additionalPrivilege = await identityProjectAdditionalPrivilegeDAL.create({
      projectMembershipId: identityProjectMembership.id,
      slug,
      permissions: customPermission,
      isTemporary: true,
      temporaryMode: IdentityProjectAdditionalPrivilegeTemporaryMode.Relative,
      temporaryRange: dto.temporaryRange,
      temporaryAccessStartTime: new Date(dto.temporaryAccessStartTime),
      temporaryAccessEndTime: new Date(new Date(dto.temporaryAccessStartTime).getTime() + relativeTempAllocatedTimeInMs)
    });
    return {
      ...additionalPrivilege,
      permissions: unpackPermissions(additionalPrivilege.permissions)
    };
  };

  const updateById = async ({
    id,
    data,
    actorOrgId,
    actor,
    actorId,
    actorAuthMethod
  }: TUpdateIdentityPrivilegeByIdDTO) => {
    const identityPrivilege = await identityProjectAdditionalPrivilegeDAL.findById(id);
    if (!identityPrivilege) throw new NotFoundError({ message: `Identity privilege with ${id} not found` });

    const identityProjectMembership = await identityProjectDAL.findOne({ id: identityPrivilege.projectMembershipId });
    if (!identityProjectMembership)
      throw new NotFoundError({
        message: `Failed to find identity with membership ${identityPrivilege.projectMembershipId}`
      });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      identityProjectMembership.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Identity);
    const { permission: identityRolePermission } = await permissionService.getProjectPermission(
      ActorType.IDENTITY,
      identityProjectMembership.identityId,
      identityProjectMembership.projectId,
      actorAuthMethod,
      actorOrgId
    );
    const hasRequiredPriviledges = isAtLeastAsPrivileged(permission, identityRolePermission);
    if (!hasRequiredPriviledges)
      throw new ForbiddenRequestError({ message: "Failed to update more privileged identity" });

    if (data?.slug) {
      const existingSlug = await identityProjectAdditionalPrivilegeDAL.findOne({
        slug: data.slug,
        projectMembershipId: identityProjectMembership.id
      });
      if (existingSlug && existingSlug.id !== identityPrivilege.id)
        throw new BadRequestError({ message: "Additional privilege with provided slug already exists" });
    }

    const isTemporary = typeof data?.isTemporary !== "undefined" ? data.isTemporary : identityPrivilege.isTemporary;
    if (isTemporary) {
      const temporaryAccessStartTime = data?.temporaryAccessStartTime || identityPrivilege?.temporaryAccessStartTime;
      const temporaryRange = data?.temporaryRange || identityPrivilege?.temporaryRange;
      const additionalPrivilege = await identityProjectAdditionalPrivilegeDAL.updateById(identityPrivilege.id, {
        slug: data.slug,
        permissions: data.permissions,
        isTemporary: data.isTemporary,
        temporaryRange: data.temporaryRange,
        temporaryMode: data.temporaryMode,
        temporaryAccessStartTime: new Date(temporaryAccessStartTime || ""),
        temporaryAccessEndTime: new Date(new Date(temporaryAccessStartTime || "").getTime() + ms(temporaryRange || ""))
      });
      return {
        ...additionalPrivilege,
        permissions: unpackPermissions(additionalPrivilege.permissions)
      };
    }

    const additionalPrivilege = await identityProjectAdditionalPrivilegeDAL.updateById(identityPrivilege.id, {
      slug: data.slug,
      permissions: data.permissions,
      isTemporary: false,
      temporaryAccessStartTime: null,
      temporaryAccessEndTime: null,
      temporaryRange: null,
      temporaryMode: null
    });
    return {
      ...additionalPrivilege,
      permissions: unpackPermissions(additionalPrivilege.permissions)
    };
  };

  const deleteById = async ({ actorId, id, actor, actorOrgId, actorAuthMethod }: TDeleteIdentityPrivilegeByIdDTO) => {
    const identityPrivilege = await identityProjectAdditionalPrivilegeDAL.findById(id);
    if (!identityPrivilege) throw new NotFoundError({ message: `Identity privilege with ${id} not found` });

    const identityProjectMembership = await identityProjectDAL.findOne({ id: identityPrivilege.projectMembershipId });
    if (!identityProjectMembership)
      throw new NotFoundError({
        message: `Failed to find identity with membership ${identityPrivilege.projectMembershipId}`
      });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      identityProjectMembership.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.Identity);
    const { permission: identityRolePermission } = await permissionService.getProjectPermission(
      ActorType.IDENTITY,
      identityProjectMembership.identityId,
      identityProjectMembership.projectId,
      actorAuthMethod,
      actorOrgId
    );
    const hasRequiredPriviledges = isAtLeastAsPrivileged(permission, identityRolePermission);
    if (!hasRequiredPriviledges)
      throw new ForbiddenRequestError({ message: "Failed to update more privileged identity" });

    const deletedPrivilege = await identityProjectAdditionalPrivilegeDAL.deleteById(identityPrivilege.id);
    return {
      ...deletedPrivilege,
      permissions: unpackPermissions(deletedPrivilege.permissions)
    };
  };

  const getPrivilegeDetailsById = async ({
    id,
    actorOrgId,
    actor,
    actorId,
    actorAuthMethod
  }: TGetIdentityPrivilegeDetailsByIdDTO) => {
    const identityPrivilege = await identityProjectAdditionalPrivilegeDAL.findById(id);
    if (!identityPrivilege) throw new NotFoundError({ message: `Identity privilege with ${id} not found` });

    const identityProjectMembership = await identityProjectDAL.findOne({ id: identityPrivilege.projectMembershipId });
    if (!identityProjectMembership)
      throw new NotFoundError({
        message: `Failed to find identity with membership ${identityPrivilege.projectMembershipId}`
      });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      identityProjectMembership.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Identity);

    return {
      ...identityPrivilege,
      permissions: unpackPermissions(identityPrivilege.permissions)
    };
  };

  const getPrivilegeDetailsBySlug = async ({
    identityId,
    slug,
    projectSlug,
    actorOrgId,
    actor,
    actorId,
    actorAuthMethod
  }: TGetIdentityPrivilegeDetailsBySlugDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new NotFoundError({ message: `Project with slug ${slug} not found` });
    const projectId = project.id;

    const identityProjectMembership = await identityProjectDAL.findOne({ identityId, projectId });
    if (!identityProjectMembership)
      throw new NotFoundError({ message: `Failed to find identity with id ${identityId}` });
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      identityProjectMembership.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Identity);

    const identityPrivilege = await identityProjectAdditionalPrivilegeDAL.findOne({
      slug,
      projectMembershipId: identityProjectMembership.id
    });
    if (!identityPrivilege) throw new NotFoundError({ message: "Identity additional privilege not found" });

    return {
      ...identityPrivilege,
      permissions: unpackPermissions(identityPrivilege.permissions)
    };
  };

  const listIdentityProjectPrivileges = async ({
    identityId,
    actorOrgId,
    actor,
    actorId,
    actorAuthMethod,
    projectId
  }: TListIdentityPrivilegesDTO) => {
    const identityProjectMembership = await identityProjectDAL.findOne({ identityId, projectId });
    if (!identityProjectMembership)
      throw new NotFoundError({ message: `Failed to find identity with id ${identityId}` });
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      identityProjectMembership.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Identity);

    const identityPrivileges = await identityProjectAdditionalPrivilegeDAL.find({
      projectMembershipId: identityProjectMembership.id
    });
    return identityPrivileges;
  };

  return {
    getPrivilegeDetailsById,
    getPrivilegeDetailsBySlug,
    listIdentityProjectPrivileges,
    create,
    updateById,
    deleteById
  };
};
