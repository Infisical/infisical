import { ForbiddenError, MongoAbility, RawRuleOf, subject } from "@casl/ability";
import { PackRule, packRules, unpackRules } from "@casl/ability/extra";
import ms from "ms";

import { ActionProjectType } from "@app/db/schemas";
import { isAtLeastAsPrivileged } from "@app/lib/casl";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { UnpackedPermissionSchema } from "@app/server/routes/santizedSchemas/permission";
import { ActorType } from "@app/services/auth/auth-type";
import { TIdentityProjectDALFactory } from "@app/services/identity-project/identity-project-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TPermissionServiceFactory } from "../permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSet, ProjectPermissionSub } from "../permission/project-permission";
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
  projectDAL: Pick<TProjectDALFactory, "findProjectBySlug">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TIdentityProjectAdditionalPrivilegeServiceFactory = ReturnType<
  typeof identityProjectAdditionalPrivilegeServiceFactory
>;

const unpackPermissions = (permissions: unknown) =>
  UnpackedPermissionSchema.array().parse(
    unpackRules((permissions || []) as PackRule<RawRuleOf<MongoAbility<ProjectPermissionSet>>>[])
  );

export const identityProjectAdditionalPrivilegeServiceFactory = ({
  identityProjectAdditionalPrivilegeDAL,
  identityProjectDAL,
  permissionService,
  projectDAL
}: TIdentityProjectAdditionalPrivilegeServiceFactoryDep) => {
  const create = async ({
    slug,
    actor,
    actorId,
    identityId,
    projectSlug,
    permissions: customPermission,
    actorOrgId,
    actorAuthMethod,
    ...dto
  }: TCreateIdentityPrivilegeDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });
    const projectId = project.id;

    const identityProjectMembership = await identityProjectDAL.findOne({ identityId, projectId });
    if (!identityProjectMembership)
      throw new NotFoundError({ message: `Failed to find identity with id ${identityId}` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: identityProjectMembership.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      subject(ProjectPermissionSub.Identity, { identityId })
    );

    const { permission: targetIdentityPermission } = await permissionService.getProjectPermission({
      actor: ActorType.IDENTITY,
      actorId: identityId,
      projectId: identityProjectMembership.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });

    // we need to validate that the privilege given is not higher than the assigning users permission
    // @ts-expect-error this is expected error because of one being really accurate rule definition other being a bit more broader. Both are valid casl rules
    targetIdentityPermission.update(targetIdentityPermission.rules.concat(customPermission));
    const hasRequiredPriviledges = isAtLeastAsPrivileged(permission, targetIdentityPermission);
    if (!hasRequiredPriviledges)
      throw new ForbiddenRequestError({ message: "Failed to update more privileged identity" });

    const existingSlug = await identityProjectAdditionalPrivilegeDAL.findOne({
      slug,
      projectMembershipId: identityProjectMembership.id
    });
    if (existingSlug) throw new BadRequestError({ message: "Additional privilege of provided slug exist" });

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

  const updateBySlug = async ({
    projectSlug,
    slug,
    identityId,
    data,
    actorOrgId,
    actor,
    actorId,
    actorAuthMethod
  }: TUpdateIdentityPrivilegeDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });
    const projectId = project.id;

    const identityProjectMembership = await identityProjectDAL.findOne({ identityId, projectId });
    if (!identityProjectMembership)
      throw new NotFoundError({ message: `Failed to find identity with id ${identityId}` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: identityProjectMembership.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      subject(ProjectPermissionSub.Identity, { identityId })
    );

    const { permission: targetIdentityPermission } = await permissionService.getProjectPermission({
      actor: ActorType.IDENTITY,
      actorId: identityProjectMembership.identityId,
      projectId: identityProjectMembership.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });

    // we need to validate that the privilege given is not higher than the assigning users permission
    // @ts-expect-error this is expected error because of one being really accurate rule definition other being a bit more broader. Both are valid casl rules
    targetIdentityPermission.update(targetIdentityPermission.rules.concat(data.permissions || []));
    const hasRequiredPriviledges = isAtLeastAsPrivileged(permission, targetIdentityPermission);
    if (!hasRequiredPriviledges)
      throw new ForbiddenRequestError({ message: "Failed to update more privileged identity" });

    const identityPrivilege = await identityProjectAdditionalPrivilegeDAL.findOne({
      slug,
      projectMembershipId: identityProjectMembership.id
    });
    if (!identityPrivilege) {
      throw new NotFoundError({
        message: `Identity additional privilege with slug '${slug}' not found for the specified identity with ID '${identityProjectMembership.identityId}'`
      });
    }
    if (data?.slug) {
      const existingSlug = await identityProjectAdditionalPrivilegeDAL.findOne({
        slug: data.slug,
        projectMembershipId: identityProjectMembership.id
      });
      if (existingSlug && existingSlug.id !== identityPrivilege.id)
        throw new BadRequestError({ message: "Additional privilege of provided slug exist" });
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

  const deleteBySlug = async ({
    actorId,
    slug,
    identityId,
    projectSlug,
    actor,
    actorOrgId,
    actorAuthMethod
  }: TDeleteIdentityPrivilegeDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });
    const projectId = project.id;

    const identityProjectMembership = await identityProjectDAL.findOne({ identityId, projectId });
    if (!identityProjectMembership)
      throw new NotFoundError({ message: `Failed to find identity with id ${identityId}` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: identityProjectMembership.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      subject(ProjectPermissionSub.Identity, { identityId })
    );

    const { permission: identityRolePermission } = await permissionService.getProjectPermission({
      actor: ActorType.IDENTITY,
      actorId: identityProjectMembership.identityId,
      projectId: identityProjectMembership.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    const hasRequiredPriviledges = isAtLeastAsPrivileged(permission, identityRolePermission);
    if (!hasRequiredPriviledges)
      throw new ForbiddenRequestError({ message: "Failed to edit more privileged identity" });

    const identityPrivilege = await identityProjectAdditionalPrivilegeDAL.findOne({
      slug,
      projectMembershipId: identityProjectMembership.id
    });
    if (!identityPrivilege) {
      throw new NotFoundError({
        message: `Identity additional privilege with slug '${slug}' not found for the specified identity with ID '${identityProjectMembership.identityId}'`
      });
    }

    const deletedPrivilege = await identityProjectAdditionalPrivilegeDAL.deleteById(identityPrivilege.id);
    return {
      ...deletedPrivilege,

      permissions: unpackPermissions(deletedPrivilege.permissions)
    };
  };

  const getPrivilegeDetailsBySlug = async ({
    projectSlug,
    identityId,
    slug,
    actorOrgId,
    actor,
    actorId,
    actorAuthMethod
  }: TGetIdentityPrivilegeDetailsDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });
    const projectId = project.id;

    const identityProjectMembership = await identityProjectDAL.findOne({ identityId, projectId });
    if (!identityProjectMembership)
      throw new NotFoundError({ message: `Failed to find identity with id ${identityId}` });
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: identityProjectMembership.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.Identity, { identityId })
    );

    const identityPrivilege = await identityProjectAdditionalPrivilegeDAL.findOne({
      slug,
      projectMembershipId: identityProjectMembership.id
    });
    if (!identityPrivilege) {
      throw new NotFoundError({
        message: `Identity additional privilege with slug '${slug}' not found for the specified identity with ID '${identityProjectMembership.identityId}'`
      });
    }
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
    projectSlug
  }: TListIdentityPrivilegesDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });
    const projectId = project.id;

    const identityProjectMembership = await identityProjectDAL.findOne({ identityId, projectId });
    if (!identityProjectMembership)
      throw new NotFoundError({ message: `Failed to find identity with id ${identityId}` });
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: identityProjectMembership.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.Identity, { identityId })
    );

    const identityPrivileges = await identityProjectAdditionalPrivilegeDAL.find({
      projectMembershipId: identityProjectMembership.id
    });
    return identityPrivileges.map((el) => ({
      ...el,
      permissions: unpackPermissions(el.permissions)
    }));
  };

  return {
    create,
    updateBySlug,
    deleteBySlug,
    getPrivilegeDetailsBySlug,
    listIdentityProjectPrivileges
  };
};
