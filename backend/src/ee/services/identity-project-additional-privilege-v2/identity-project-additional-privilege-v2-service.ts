import { ForbiddenError, subject } from "@casl/ability";
import { packRules } from "@casl/ability/extra";

import { TableName } from "@app/db/schemas";
import { BadRequestError, NotFoundError, PermissionBoundaryError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { validateHandlebarTemplate } from "@app/lib/template/validate-handlebars";
import { unpackPermissions } from "@app/server/routes/sanitizedSchema/permission";
import { ActorType } from "@app/services/auth/auth-type";
import { TIdentityProjectDALFactory } from "@app/services/identity-project/identity-project-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { constructPermissionErrorMessage, validatePrivilegeChangeOperation } from "../permission/permission-fns";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { ProjectPermissionIdentityActions, ProjectPermissionSub } from "../permission/project-permission";
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

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: identityProjectMembership.projectId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityActions.Edit,
      subject(ProjectPermissionSub.Identity, { identityId })
    );
    const { permission: targetIdentityPermission, membership } = await permissionService.getProjectPermission({
      actor: ActorType.IDENTITY,
      actorId: identityId,
      projectId: identityProjectMembership.projectId,
      actorAuthMethod,
      actorOrgId
    });

    // we need to validate that the privilege given is not higher than the assigning users permission
    // @ts-expect-error this is expected error because of one being really accurate rule definition other being a bit more broader. Both are valid casl rules
    targetIdentityPermission.update(targetIdentityPermission.rules.concat(customPermission));
    const permissionBoundary = validatePrivilegeChangeOperation(
      membership.shouldUseNewPrivilegeSystem,
      ProjectPermissionIdentityActions.GrantPrivileges,
      ProjectPermissionSub.Identity,
      permission,
      targetIdentityPermission
    );
    if (!permissionBoundary.isValid)
      throw new PermissionBoundaryError({
        message: constructPermissionErrorMessage(
          "Failed to update more privileged identity",
          membership.shouldUseNewPrivilegeSystem,
          ProjectPermissionIdentityActions.GrantPrivileges,
          ProjectPermissionSub.Identity
        ),
        details: { missingPermissions: permissionBoundary.missingPermissions }
      });
    validateHandlebarTemplate("Identity Additional Privilege Create", JSON.stringify(customPermission || []), {
      allowedExpressions: (val) => val.includes("identity.")
    });

    const existingSlug = await identityProjectAdditionalPrivilegeDAL.findOne({
      slug,
      projectMembershipId: identityProjectMembership.id
    });
    if (existingSlug) throw new BadRequestError({ message: "Additional privilege with provided slug already exists" });

    const packedPermission = JSON.stringify(packRules(customPermission));
    if (!dto.isTemporary) {
      const additionalPrivilege = await identityProjectAdditionalPrivilegeDAL.create({
        projectMembershipId: identityProjectMembership.id,
        slug,
        permissions: packedPermission
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
      permissions: packedPermission,
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

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: identityProjectMembership.projectId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityActions.Edit,
      subject(ProjectPermissionSub.Identity, { identityId: identityProjectMembership.identityId })
    );
    const { permission: targetIdentityPermission, membership } = await permissionService.getProjectPermission({
      actor: ActorType.IDENTITY,
      actorId: identityProjectMembership.identityId,
      projectId: identityProjectMembership.projectId,
      actorAuthMethod,
      actorOrgId
    });

    // we need to validate that the privilege given is not higher than the assigning users permission
    // @ts-expect-error this is expected error because of one being really accurate rule definition other being a bit more broader. Both are valid casl rules
    targetIdentityPermission.update(targetIdentityPermission.rules.concat(data.permissions || []));
    const permissionBoundary = validatePrivilegeChangeOperation(
      membership.shouldUseNewPrivilegeSystem,
      ProjectPermissionIdentityActions.GrantPrivileges,
      ProjectPermissionSub.Identity,
      permission,
      targetIdentityPermission
    );
    if (!permissionBoundary.isValid)
      throw new PermissionBoundaryError({
        message: constructPermissionErrorMessage(
          "Failed to update more privileged identity",
          membership.shouldUseNewPrivilegeSystem,
          ProjectPermissionIdentityActions.GrantPrivileges,
          ProjectPermissionSub.Identity
        ),
        details: { missingPermissions: permissionBoundary.missingPermissions }
      });

    validateHandlebarTemplate("Identity Additional Privilege Update", JSON.stringify(data.permissions || []), {
      allowedExpressions: (val) => val.includes("identity.")
    });

    if (data?.slug) {
      const existingSlug = await identityProjectAdditionalPrivilegeDAL.findOne({
        slug: data.slug,
        projectMembershipId: identityProjectMembership.id
      });
      if (existingSlug && existingSlug.id !== identityPrivilege.id)
        throw new BadRequestError({ message: "Additional privilege with provided slug already exists" });
    }

    const isTemporary = typeof data?.isTemporary !== "undefined" ? data.isTemporary : identityPrivilege.isTemporary;
    const packedPermission = data.permissions ? JSON.stringify(packRules(data.permissions)) : undefined;
    if (isTemporary) {
      const temporaryAccessStartTime = data?.temporaryAccessStartTime || identityPrivilege?.temporaryAccessStartTime;
      const temporaryRange = data?.temporaryRange || identityPrivilege?.temporaryRange;
      const additionalPrivilege = await identityProjectAdditionalPrivilegeDAL.updateById(identityPrivilege.id, {
        slug: data.slug,
        permissions: packedPermission,
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

  const deleteById = async ({ actorId, id, actor, actorOrgId, actorAuthMethod }: TDeleteIdentityPrivilegeByIdDTO) => {
    const identityPrivilege = await identityProjectAdditionalPrivilegeDAL.findById(id);
    if (!identityPrivilege) throw new NotFoundError({ message: `Identity privilege with ${id} not found` });

    const identityProjectMembership = await identityProjectDAL.findOne({ id: identityPrivilege.projectMembershipId });
    if (!identityProjectMembership)
      throw new NotFoundError({
        message: `Failed to find identity with membership ${identityPrivilege.projectMembershipId}`
      });

    const { permission, membership } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: identityProjectMembership.projectId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityActions.Edit,
      subject(ProjectPermissionSub.Identity, { identityId: identityProjectMembership.identityId })
    );
    const { permission: identityRolePermission } = await permissionService.getProjectPermission({
      actor: ActorType.IDENTITY,
      actorId: identityProjectMembership.identityId,
      projectId: identityProjectMembership.projectId,
      actorAuthMethod,
      actorOrgId
    });
    const permissionBoundary = validatePrivilegeChangeOperation(
      membership.shouldUseNewPrivilegeSystem,
      ProjectPermissionIdentityActions.GrantPrivileges,
      ProjectPermissionSub.Identity,
      permission,
      identityRolePermission
    );
    if (!permissionBoundary.isValid)
      throw new PermissionBoundaryError({
        message: constructPermissionErrorMessage(
          "Failed to update more privileged identity",
          membership.shouldUseNewPrivilegeSystem,
          ProjectPermissionIdentityActions.GrantPrivileges,
          ProjectPermissionSub.Identity
        ),
        details: { missingPermissions: permissionBoundary.missingPermissions }
      });

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

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: identityProjectMembership.projectId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityActions.Read,
      subject(ProjectPermissionSub.Identity, { identityId: identityProjectMembership.identityId })
    );

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
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: identityProjectMembership.projectId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityActions.Read,
      subject(ProjectPermissionSub.Identity, { identityId: identityProjectMembership.identityId })
    );

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
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: identityProjectMembership.projectId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityActions.Read,
      subject(ProjectPermissionSub.Identity, { identityId: identityProjectMembership.identityId })
    );

    const identityPrivileges = await identityProjectAdditionalPrivilegeDAL.find(
      {
        projectMembershipId: identityProjectMembership.id
      },
      { sort: [[`${TableName.IdentityProjectAdditionalPrivilege}.slug` as "slug", "asc"]] }
    );
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
