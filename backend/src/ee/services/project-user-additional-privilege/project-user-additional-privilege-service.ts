import { ForbiddenError, MongoAbility, RawRuleOf } from "@casl/ability";
import { PackRule, packRules, unpackRules } from "@casl/ability/extra";

import { ActionProjectType, TableName } from "@app/db/schemas";
import { BadRequestError, NotFoundError, PermissionBoundaryError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { validateHandlebarTemplate } from "@app/lib/template/validate-handlebars";
import { UnpackedPermissionSchema } from "@app/server/routes/sanitizedSchema/permission";
import { ActorType } from "@app/services/auth/auth-type";
import { TProjectMembershipDALFactory } from "@app/services/project-membership/project-membership-dal";

import { constructPermissionErrorMessage, validatePrivilegeChangeOperation } from "../permission/permission-fns";
import { TPermissionServiceFactory } from "../permission/permission-service";
import {
  ProjectPermissionMemberActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "../permission/project-permission";
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
    if (!projectMembership)
      throw new NotFoundError({ message: `Project membership with ID ${projectMembershipId} found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: projectMembership.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionMemberActions.Edit, ProjectPermissionSub.Member);
    const { permission: targetUserPermission, membership } = await permissionService.getProjectPermission({
      actor: ActorType.USER,
      actorId: projectMembership.userId,
      projectId: projectMembership.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });

    // we need to validate that the privilege given is not higher than the assigning users permission
    // @ts-expect-error this is expected error because of one being really accurate rule definition other being a bit more broader. Both are valid casl rules
    targetUserPermission.update(targetUserPermission.rules.concat(customPermission));
    const permissionBoundary = validatePrivilegeChangeOperation(
      membership.shouldUseNewPrivilegeSystem,
      ProjectPermissionMemberActions.GrantPrivileges,
      ProjectPermissionSub.Member,
      permission,
      targetUserPermission
    );
    if (!permissionBoundary.isValid)
      throw new PermissionBoundaryError({
        message: constructPermissionErrorMessage(
          "Failed to update more privileged user",
          membership.shouldUseNewPrivilegeSystem,
          ProjectPermissionMemberActions.GrantPrivileges,
          ProjectPermissionSub.Member
        ),
        details: { missingPermissions: permissionBoundary.missingPermissions }
      });

    const existingSlug = await projectUserAdditionalPrivilegeDAL.findOne({
      slug,
      projectId: projectMembership.projectId,
      userId: projectMembership.userId
    });
    if (existingSlug)
      throw new BadRequestError({ message: `Additional privilege with provided slug ${slug} already exists` });

    validateHandlebarTemplate("User Additional Privilege Create", JSON.stringify(customPermission || []), {
      allowedExpressions: (val) => val.includes("identity.")
    });

    const packedPermission = JSON.stringify(packRules(customPermission));
    if (!dto.isTemporary) {
      const additionalPrivilege = await projectUserAdditionalPrivilegeDAL.create({
        userId: projectMembership.userId,
        projectId: projectMembership.projectId,
        slug,
        permissions: packedPermission
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
      permissions: packedPermission,
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
    if (!userPrivilege)
      throw new NotFoundError({ message: `User additional privilege with ID ${privilegeId} not found` });

    const projectMembership = await projectMembershipDAL.findOne({
      userId: userPrivilege.userId,
      projectId: userPrivilege.projectId
    });

    if (!projectMembership)
      throw new NotFoundError({
        message: `Project membership for user with ID '${userPrivilege.userId}' not found in project with ID '${userPrivilege.projectId}'`
      });

    const { permission, membership } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: projectMembership.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionMemberActions.Edit, ProjectPermissionSub.Member);
    const { permission: targetUserPermission } = await permissionService.getProjectPermission({
      actor: ActorType.USER,
      actorId: projectMembership.userId,
      projectId: projectMembership.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });

    // we need to validate that the privilege given is not higher than the assigning users permission
    // @ts-expect-error this is expected error because of one being really accurate rule definition other being a bit more broader. Both are valid casl rules
    targetUserPermission.update(targetUserPermission.rules.concat(dto.permissions || []));
    const permissionBoundary = validatePrivilegeChangeOperation(
      membership.shouldUseNewPrivilegeSystem,
      ProjectPermissionMemberActions.GrantPrivileges,
      ProjectPermissionSub.Member,
      permission,
      targetUserPermission
    );
    if (!permissionBoundary.isValid)
      throw new PermissionBoundaryError({
        message: constructPermissionErrorMessage(
          "Failed to update more privileged user",
          membership.shouldUseNewPrivilegeSystem,
          ProjectPermissionMemberActions.GrantPrivileges,
          ProjectPermissionSub.Member
        ),
        details: { missingPermissions: permissionBoundary.missingPermissions }
      });

    if (dto?.slug) {
      const existingSlug = await projectUserAdditionalPrivilegeDAL.findOne({
        slug: dto.slug,
        userId: projectMembership.id,
        projectId: projectMembership.projectId
      });
      if (existingSlug && existingSlug.id !== userPrivilege.id)
        throw new BadRequestError({ message: `Additional privilege with provided slug ${dto.slug} already exists` });
    }

    validateHandlebarTemplate("User Additional Privilege Update", JSON.stringify(dto.permissions || []), {
      allowedExpressions: (val) => val.includes("identity.")
    });

    const isTemporary = typeof dto?.isTemporary !== "undefined" ? dto.isTemporary : userPrivilege.isTemporary;

    const packedPermission = dto.permissions && JSON.stringify(packRules(dto.permissions));
    if (isTemporary) {
      const temporaryAccessStartTime = dto?.temporaryAccessStartTime || userPrivilege?.temporaryAccessStartTime;
      const temporaryRange = dto?.temporaryRange || userPrivilege?.temporaryRange;
      const additionalPrivilege = await projectUserAdditionalPrivilegeDAL.updateById(userPrivilege.id, {
        slug: dto.slug,
        permissions: packedPermission,
        isTemporary: dto.isTemporary,
        temporaryRange: dto.temporaryRange,
        temporaryMode: dto.temporaryMode,
        temporaryAccessStartTime: new Date(temporaryAccessStartTime || ""),
        temporaryAccessEndTime: new Date(new Date(temporaryAccessStartTime || "").getTime() + ms(temporaryRange || ""))
      });

      return {
        ...additionalPrivilege,
        permissions: unpackPermissions(additionalPrivilege.permissions)
      };
    }

    const additionalPrivilege = await projectUserAdditionalPrivilegeDAL.updateById(userPrivilege.id, {
      slug: dto.slug,
      permissions: packedPermission,
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
    if (!userPrivilege)
      throw new NotFoundError({ message: `User additional privilege with ID ${privilegeId} not found` });

    const projectMembership = await projectMembershipDAL.findOne({
      userId: userPrivilege.userId,
      projectId: userPrivilege.projectId
    });
    if (!projectMembership)
      throw new NotFoundError({
        message: `Project membership for user with ID '${userPrivilege.userId}' not found in project with ID '${userPrivilege.projectId}'`
      });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: projectMembership.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionMemberActions.Edit, ProjectPermissionSub.Member);

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
    if (!userPrivilege)
      throw new NotFoundError({ message: `User additional privilege with ID  ${privilegeId} not found` });

    const projectMembership = await projectMembershipDAL.findOne({
      userId: userPrivilege.userId,
      projectId: userPrivilege.projectId
    });
    if (!projectMembership)
      throw new NotFoundError({
        message: `Project membership for user with ID '${userPrivilege.userId}' not found in project with ID '${userPrivilege.projectId}'`
      });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: projectMembership.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionMemberActions.Read, ProjectPermissionSub.Member);

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
    if (!projectMembership)
      throw new NotFoundError({ message: `Project membership with ID ${projectMembershipId} not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: projectMembership.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionMemberActions.Read, ProjectPermissionSub.Member);

    const userPrivileges = await projectUserAdditionalPrivilegeDAL.find(
      {
        userId: projectMembership.userId,
        projectId: projectMembership.projectId
      },
      { sort: [[`${TableName.ProjectUserAdditionalPrivilege}.slug` as "slug", "asc"]] }
    );
    return userPrivileges;
  };

  return {
    create,
    updateById,
    deleteById,
    getPrivilegeDetailsById,
    listPrivileges
  };
};
