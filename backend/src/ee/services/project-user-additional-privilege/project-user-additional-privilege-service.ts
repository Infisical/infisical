import { ForbiddenError } from "@casl/ability";
import ms from "ms";

import { BadRequestError } from "@app/lib/errors";
import { TProjectMembershipDALFactory } from "@app/services/project-membership/project-membership-dal";

import { TPermissionServiceFactory } from "../permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "../permission/project-permission";
import { TProjectUserAdditionalPrivilegeDALFactory } from "./project-user-additional-privilege-dal";
import {
  ProjectUserAdditionalPrivilegeTemporaryMode,
  TCreateUserPrivilegeDTO,
  TDeleteUserPrivilegeDTO,
  TGetUserPrivilegeDetailsDTO,
  TUpdateUserPrivilegeDTO
} from "./project-user-additional-privilege-types";

type TProjectUserAdditionalPrivilegeServiceFactoryDep = {
  projectUserAdditionalPrivilegeDAL: TProjectUserAdditionalPrivilegeDALFactory;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TProjectUserAdditionalPrivilegeServiceFactory = ReturnType<
  typeof projectUserAdditionalPrivilegeServiceFactory
>;

export const projectUserAdditionalPrivilegeServiceFactory = ({
  projectUserAdditionalPrivilegeDAL,
  projectMembershipDAL,
  permissionService
}: TProjectUserAdditionalPrivilegeServiceFactoryDep) => {
  const create = async ({
    name,
    slug,
    actor,
    actorId,
    permissions: customPermission,
    actorOrgId,
    description,
    projectMembershipId,
    ...dto
  }: TCreateUserPrivilegeDTO) => {
    const projectMembership = await projectMembershipDAL.findById(projectMembershipId);
    if (!projectMembership) throw new BadRequestError({ message: "Project membership not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectMembership.projectId,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Member);

    const existingSlug = await projectUserAdditionalPrivilegeDAL.findOne({ slug, projectMembershipId });
    if (existingSlug) throw new BadRequestError({ message: "Additional privilege of provided slug exist" });

    if (!dto.isTemporary) {
      const additionalPrivilege = await projectUserAdditionalPrivilegeDAL.create({
        projectMembershipId,
        slug,
        permissions: customPermission,
        name,
        description
      });
      return additionalPrivilege;
    }

    const relativeTempAllocatedTimeInMs = ms(dto.temporaryRange);
    const additionalPrivilege = await projectUserAdditionalPrivilegeDAL.create({
      projectMembershipId,
      slug,
      permissions: customPermission,
      name,
      description,
      isTemporary: true,
      temporaryMode: ProjectUserAdditionalPrivilegeTemporaryMode.Relative,
      temporaryRange: dto.temporaryRange,
      temporaryAccessStartTime: new Date(dto.temporaryAccessStartTime),
      temporaryAccessEndTime: new Date(new Date(dto.temporaryAccessStartTime).getTime() + relativeTempAllocatedTimeInMs)
    });
    return additionalPrivilege;
  };

  const updateById = async ({ privilegeId, actorOrgId, actor, actorId, ...dto }: TUpdateUserPrivilegeDTO) => {
    const userPrivilege = await projectUserAdditionalPrivilegeDAL.findById(privilegeId);
    if (!userPrivilege) throw new BadRequestError({ message: "User additional privilege not found" });

    const projectMembership = await projectMembershipDAL.findById(userPrivilege.projectMembershipId);
    if (!projectMembership) throw new BadRequestError({ message: "Project membership not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectMembership.projectId,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Member);

    if (dto?.slug) {
      const existingSlug = await projectUserAdditionalPrivilegeDAL.findOne({
        slug: dto.slug,
        projectMembershipId: projectMembership.id
      });
      if (existingSlug && existingSlug.id !== userPrivilege.id)
        throw new BadRequestError({ message: "Additional privilege of provided slug exist" });
    }

    const isTemporary = typeof dto?.isTemporary !== "undefined" ? dto.isTemporary : userPrivilege.isTemporary;
    if (isTemporary) {
      const temporaryAccessStartTime = dto?.temporaryAccessStartTime || userPrivilege?.temporaryAccessStartTime;
      const temporaryRange = dto?.temporaryRange || userPrivilege?.temporaryRange;
      const additionalPrivilege = await projectUserAdditionalPrivilegeDAL.updateById(userPrivilege.id, {
        ...dto,
        temporaryAccessStartTime: new Date(temporaryAccessStartTime || ""),
        temporaryAccessEndTime: new Date(new Date(temporaryAccessStartTime || "").getTime() + ms(temporaryRange || ""))
      });
      return additionalPrivilege;
    }

    const additionalPrivilege = await projectUserAdditionalPrivilegeDAL.updateById(userPrivilege.id, {
      ...dto,
      isTemporary: false,
      temporaryAccessStartTime: null,
      temporaryAccessEndTime: null,
      temporaryRange: null,
      temporaryMode: null
    });
    return additionalPrivilege;
  };

  const deleteById = async ({ actorId, actor, actorOrgId, privilegeId }: TDeleteUserPrivilegeDTO) => {
    const userPrivilege = await projectUserAdditionalPrivilegeDAL.findById(privilegeId);
    if (!userPrivilege) throw new BadRequestError({ message: "User additional privilege not found" });

    const projectMembership = await projectMembershipDAL.findById(userPrivilege.projectMembershipId);
    if (!projectMembership) throw new BadRequestError({ message: "Project membership not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectMembership.projectId,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Member);

    const deletedPrivilege = await projectUserAdditionalPrivilegeDAL.deleteById(userPrivilege.id);
    return deletedPrivilege;
  };

  const getPrivilegeDetailsById = async ({ privilegeId, actorOrgId, actor, actorId }: TGetUserPrivilegeDetailsDTO) => {
    const userPrivilege = await projectUserAdditionalPrivilegeDAL.findById(privilegeId);
    if (!userPrivilege) throw new BadRequestError({ message: "User additional privilege not found" });

    const projectMembership = await projectMembershipDAL.findById(userPrivilege.projectMembershipId);
    if (!projectMembership) throw new BadRequestError({ message: "Project membership not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectMembership.projectId,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Member);

    return userPrivilege;
  };

  return {
    create,
    updateById,
    deleteById,
    getPrivilegeDetailsById
  };
};
