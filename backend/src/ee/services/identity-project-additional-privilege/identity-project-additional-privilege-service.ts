import { ForbiddenError } from "@casl/ability";
import ms from "ms";

import { isAtLeastAsPrivileged } from "@app/lib/casl";
import { BadRequestError, ForbiddenRequestError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";
import { TIdentityProjectDALFactory } from "@app/services/identity-project/identity-project-dal";

import { TPermissionServiceFactory } from "../permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "../permission/project-permission";
import { TIdentityProjectAdditionalPrivilegeDALFactory } from "./identity-project-additional-privilege-dal";
import {
  IdentityProjectAdditionalPrivilegeTemporaryMode,
  TCreateIdentityPrivilegeDTO,
  TDeleteIdentityPrivilegeDTO,
  TGetIdentityPrivilegeDetailsDTO,
  TListIdentityPrivilegesDTO,
  TUpdateIdentityPrivilegeDTO
} from "./identity-project-additional-privilege-types";

type TIdentityProjectAdditionalPrivilegeServiceFactoryDep = {
  identityProjectAdditionalPrivilegeDAL: TIdentityProjectAdditionalPrivilegeDALFactory;
  identityProjectDAL: Pick<TIdentityProjectDALFactory, "findOne" | "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TIdentityProjectAdditionalPrivilegeServiceFactory = ReturnType<
  typeof identityProjectAdditionalPrivilegeServiceFactory
>;

export const identityProjectAdditionalPrivilegeServiceFactory = ({
  identityProjectAdditionalPrivilegeDAL,
  identityProjectDAL,
  permissionService
}: TIdentityProjectAdditionalPrivilegeServiceFactoryDep) => {
  const create = async ({
    slug,
    actor,
    actorId,
    projectId,
    identityId,
    permissions: customPermission,
    actorOrgId,
    actorAuthMethod,
    ...dto
  }: TCreateIdentityPrivilegeDTO) => {
    const identityProjectMembership = await identityProjectDAL.findOne({ identityId, projectId });
    if (!identityProjectMembership)
      throw new BadRequestError({ message: `Failed to find identity with id ${identityId}` });

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
      throw new ForbiddenRequestError({ message: "Failed to delete more privileged identity" });

    const existingSlug = await identityProjectAdditionalPrivilegeDAL.findOne({
      slug,
      projectMembershipId: identityProjectMembership.id
    });
    if (existingSlug) throw new BadRequestError({ message: "Additional privilege of provided slug exist" });

    if (!dto.isTemporary) {
      const additionalPrivilege = await identityProjectAdditionalPrivilegeDAL.create({
        projectMembershipId: identityProjectMembership.id,
        slug,
        permissions: customPermission
      });
      return additionalPrivilege;
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
    return additionalPrivilege;
  };

  const updateById = async ({
    privilegeId,
    actorOrgId,
    actor,
    actorId,
    actorAuthMethod,
    ...dto
  }: TUpdateIdentityPrivilegeDTO) => {
    const identityPrivilege = await identityProjectAdditionalPrivilegeDAL.findById(privilegeId);
    if (!identityPrivilege) throw new BadRequestError({ message: "Identity additional privilege not found" });

    const identityProjectMembership = await identityProjectDAL.findById(identityPrivilege.projectMembershipId);
    if (!identityProjectMembership) throw new BadRequestError({ message: `Failed to find identity` });

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
      throw new ForbiddenRequestError({ message: "Failed to delete more privileged identity" });

    if (dto?.slug) {
      const existingSlug = await identityProjectAdditionalPrivilegeDAL.findOne({
        slug: dto.slug,
        projectMembershipId: identityProjectMembership.id
      });
      if (existingSlug && existingSlug.id !== identityPrivilege.id)
        throw new BadRequestError({ message: "Additional privilege of provided slug exist" });
    }

    const isTemporary = typeof dto?.isTemporary !== "undefined" ? dto.isTemporary : identityPrivilege.isTemporary;
    if (isTemporary) {
      const temporaryAccessStartTime = dto?.temporaryAccessStartTime || identityPrivilege?.temporaryAccessStartTime;
      const temporaryRange = dto?.temporaryRange || identityPrivilege?.temporaryRange;
      const additionalPrivilege = await identityProjectAdditionalPrivilegeDAL.updateById(identityPrivilege.id, {
        ...dto,
        temporaryAccessStartTime: new Date(temporaryAccessStartTime || ""),
        temporaryAccessEndTime: new Date(new Date(temporaryAccessStartTime || "").getTime() + ms(temporaryRange || ""))
      });
      return additionalPrivilege;
    }

    const additionalPrivilege = await identityProjectAdditionalPrivilegeDAL.updateById(identityPrivilege.id, {
      ...dto,
      isTemporary: false,
      temporaryAccessStartTime: null,
      temporaryAccessEndTime: null,
      temporaryRange: null,
      temporaryMode: null
    });
    return additionalPrivilege;
  };

  const deleteById = async ({
    actorId,
    actor,
    actorOrgId,
    privilegeId,
    actorAuthMethod
  }: TDeleteIdentityPrivilegeDTO) => {
    const identityPrivilege = await identityProjectAdditionalPrivilegeDAL.findById(privilegeId);
    if (!identityPrivilege) throw new BadRequestError({ message: "Identity additional privilege not found" });

    const identityProjectMembership = await identityProjectDAL.findById(identityPrivilege.projectMembershipId);
    if (!identityProjectMembership) throw new BadRequestError({ message: `Failed to find identity` });

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
      throw new ForbiddenRequestError({ message: "Failed to delete more privileged identity" });

    const deletedPrivilege = await identityProjectAdditionalPrivilegeDAL.deleteById(identityPrivilege.id);
    return deletedPrivilege;
  };

  const getPrivilegeDetailsById = async ({
    privilegeId,
    actorOrgId,
    actor,
    actorId,
    actorAuthMethod
  }: TGetIdentityPrivilegeDetailsDTO) => {
    const identityPrivilege = await identityProjectAdditionalPrivilegeDAL.findById(privilegeId);
    if (!identityPrivilege) throw new BadRequestError({ message: "Identity additional privilege not found" });

    const identityProjectMembership = await identityProjectDAL.findById(identityPrivilege.projectMembershipId);
    if (!identityProjectMembership) throw new BadRequestError({ message: `Failed to find identity` });

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
      throw new ForbiddenRequestError({ message: "Failed to delete more privileged identity" });

    return identityPrivilege;
  };

  const listIdentityProjectPrivileges = async ({
    projectId,
    identityId,
    actorOrgId,
    actor,
    actorId,
    actorAuthMethod
  }: TListIdentityPrivilegesDTO) => {
    const identityProjectMembership = await identityProjectDAL.findOne({ projectId, identityId });
    if (!identityProjectMembership) throw new BadRequestError({ message: `Failed to find identity` });

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
      throw new ForbiddenRequestError({ message: "Failed to delete more privileged identity" });

    const identityPrivileges = await identityProjectAdditionalPrivilegeDAL.find({
      projectMembershipId: identityProjectMembership.id
    });
    if (!identityPrivileges) throw new BadRequestError({ message: "Identity additional privilege not found" });
    return identityPrivileges;
  };

  return {
    create,
    updateById,
    deleteById,
    getPrivilegeDetailsById,
    listIdentityProjectPrivileges
  };
};
