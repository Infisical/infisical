import { ForbiddenError, MongoAbility, RawRuleOf } from "@casl/ability";
import { PackRule, unpackRules } from "@casl/ability/extra";
import ms from "ms";

import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { UnpackedPermissionSchema } from "@app/server/routes/santizedSchemas/permission";
import { TProjectMembershipDALFactory } from "@app/services/project-membership/project-membership-dal";

import { TPermissionServiceFactory } from "../permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSet, ProjectPermissionSub } from "../permission/project-permission";
import { TProjectUserAdditionalPrivilegeDALFactory } from "./project-user-additional-privilege-dal";
import {
  ProjectUserAdditionalPrivilegeTemporaryMode,
  TCreateUserPrivilegeDTO,
  TDeleteUserPrivilegeDTO,
  TGetUserPrivilegeDetailsDTO,
  TListUserPrivilegesDTO,
  TUpdateUserPrivilegeDTO
} from "./project-user-additional-privilege-types";

type TProjectUserAdditionalPrivilegeServiceFactoryDep = {
  projectUserAdditionalPrivilegeDAL: TProjectUserAdditionalPrivilegeDALFactory;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "findById" | "findOne">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TProjectUserAdditionalPrivilegeServiceFactory = ReturnType<
  typeof projectUserAdditionalPrivilegeServiceFactory
>;

const unpackPermissions = (permissions: unknown) =>
  UnpackedPermissionSchema.array().parse(
    unpackRules((permissions || []) as PackRule<RawRuleOf<MongoAbility<ProjectPermissionSet>>>[])
  );

export const projectUserAdditionalPrivilegeServiceFactory = ({
  projectUserAdditionalPrivilegeDAL,
  projectMembershipDAL,
  permissionService
}: TProjectUserAdditionalPrivilegeServiceFactoryDep) => {
  const create = async ({
    slug,
    actor,
    actorId,
    permissions: customPermission,
    actorOrgId,
    actorAuthMethod,
    projectMembershipId,
    ...dto
  }: TCreateUserPrivilegeDTO) => {
    const projectMembership = await projectMembershipDAL.findById(projectMembershipId);
    if (!projectMembership) throw new NotFoundError({ message: "Project membership not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectMembership.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Member);

    const existingSlug = await projectUserAdditionalPrivilegeDAL.findOne({
      slug,
      projectId: projectMembership.projectId,
      userId: projectMembership.userId
    });
    if (existingSlug) throw new BadRequestError({ message: "Additional privilege of provided slug exist" });

    if (!dto.isTemporary) {
      const additionalPrivilege = await projectUserAdditionalPrivilegeDAL.create({
        userId: projectMembership.userId,
        projectId: projectMembership.projectId,
        slug,
        permissions: customPermission
      });
      return {
        ...additionalPrivilege,
        permissions: unpackPermissions(additionalPrivilege.permissions)
      };
    }

    const relativeTempAllocatedTimeInMs = ms(dto.temporaryRange);
    const additionalPrivilege = await projectUserAdditionalPrivilegeDAL.create({
      projectId: projectMembership.projectId,
      userId: projectMembership.userId,
      slug,
      permissions: customPermission,
      isTemporary: true,
      temporaryMode: ProjectUserAdditionalPrivilegeTemporaryMode.Relative,
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
    privilegeId,
    actorOrgId,
    actor,
    actorId,
    actorAuthMethod,
    ...dto
  }: TUpdateUserPrivilegeDTO) => {
    const userPrivilege = await projectUserAdditionalPrivilegeDAL.findById(privilegeId);
    if (!userPrivilege) throw new NotFoundError({ message: "User additional privilege not found" });

    const projectMembership = await projectMembershipDAL.findOne({
      userId: userPrivilege.userId,
      projectId: userPrivilege.projectId
    });

    if (!projectMembership) throw new NotFoundError({ message: "Project membership not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectMembership.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Member);

    if (dto?.slug) {
      const existingSlug = await projectUserAdditionalPrivilegeDAL.findOne({
        slug: dto.slug,
        userId: projectMembership.id,
        projectId: projectMembership.projectId
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

      return {
        ...additionalPrivilege,
        permissions: unpackPermissions(additionalPrivilege.permissions)
      };
    }

    const additionalPrivilege = await projectUserAdditionalPrivilegeDAL.updateById(userPrivilege.id, {
      ...dto,
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

  const deleteById = async ({ actorId, actor, actorOrgId, actorAuthMethod, privilegeId }: TDeleteUserPrivilegeDTO) => {
    const userPrivilege = await projectUserAdditionalPrivilegeDAL.findById(privilegeId);
    if (!userPrivilege) throw new NotFoundError({ message: "User additional privilege not found" });

    const projectMembership = await projectMembershipDAL.findOne({
      userId: userPrivilege.userId,
      projectId: userPrivilege.projectId
    });
    if (!projectMembership) throw new NotFoundError({ message: "Project membership not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectMembership.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Member);

    const deletedPrivilege = await projectUserAdditionalPrivilegeDAL.deleteById(userPrivilege.id);
    return {
      ...deletedPrivilege,
      permissions: unpackPermissions(deletedPrivilege.permissions)
    };
  };

  const getPrivilegeDetailsById = async ({
    privilegeId,
    actorOrgId,
    actor,
    actorId,
    actorAuthMethod
  }: TGetUserPrivilegeDetailsDTO) => {
    const userPrivilege = await projectUserAdditionalPrivilegeDAL.findById(privilegeId);
    if (!userPrivilege) throw new NotFoundError({ message: "User additional privilege not found" });

    const projectMembership = await projectMembershipDAL.findOne({
      userId: userPrivilege.userId,
      projectId: userPrivilege.projectId
    });
    if (!projectMembership) throw new NotFoundError({ message: "Project membership not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectMembership.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Member);

    return {
      ...userPrivilege,
      permissions: unpackPermissions(userPrivilege.permissions)
    };
  };

  const listPrivileges = async ({
    projectMembershipId,
    actorOrgId,
    actor,
    actorId,
    actorAuthMethod
  }: TListUserPrivilegesDTO) => {
    const projectMembership = await projectMembershipDAL.findById(projectMembershipId);
    if (!projectMembership) throw new NotFoundError({ message: "Project membership not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectMembership.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Member);

    const userPrivileges = await projectUserAdditionalPrivilegeDAL.find({
      userId: projectMembership.userId,
      projectId: projectMembership.projectId
    });
    return userPrivileges.map((el) => ({
      ...el,
      permissions: unpackPermissions(el.permissions)
    }));
  };

  return {
    create,
    updateById,
    deleteById,
    getPrivilegeDetailsById,
    listPrivileges
  };
};
