import { ForbiddenError, MongoAbility, RawRuleOf } from "@casl/ability";
import { PackRule, unpackRules } from "@casl/ability/extra";
import ms from "ms";
import { z } from "zod";

import { isAtLeastAsPrivileged } from "@app/lib/casl";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
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

// TODO(akhilmhdh): move this to more centralized
export const UnpackedPermissionSchema = z.object({
  subject: z.union([z.string().min(1), z.string().array()]).optional(),
  action: z.union([z.string().min(1), z.string().array()]),
  conditions: z
    .object({
      environment: z.string().optional(),
      secretPath: z
        .object({
          $glob: z.string().min(1)
        })
        .optional()
    })
    .optional()
});

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
    if (!project) throw new NotFoundError({ message: "Project not found" });
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
    if (existingSlug) throw new BadRequestError({ message: "Additional privilege of provided slug exist" });

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
    if (!project) throw new NotFoundError({ message: "Project not found" });
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

    const identityPrivilege = await identityProjectAdditionalPrivilegeDAL.findOne({
      slug,
      projectMembershipId: identityProjectMembership.id
    });
    if (!identityPrivilege) throw new NotFoundError({ message: "Identity additional privilege not found" });
    if (data?.slug) {
      const existingSlug = await identityProjectAdditionalPrivilegeDAL.findOne({
        slug: data.slug,
        projectMembershipId: identityProjectMembership.id
      });
      if (existingSlug && existingSlug.id !== identityPrivilege.id)
        throw new BadRequestError({ message: "Additional privilege of provided slug exist" });
    }

    const isTemporary = typeof data?.isTemporary !== "undefined" ? data.isTemporary : identityPrivilege.isTemporary;
    if (isTemporary) {
      const temporaryAccessStartTime = data?.temporaryAccessStartTime || identityPrivilege?.temporaryAccessStartTime;
      const temporaryRange = data?.temporaryRange || identityPrivilege?.temporaryRange;
      const additionalPrivilege = await identityProjectAdditionalPrivilegeDAL.updateById(identityPrivilege.id, {
        ...data,
        temporaryAccessStartTime: new Date(temporaryAccessStartTime || ""),
        temporaryAccessEndTime: new Date(new Date(temporaryAccessStartTime || "").getTime() + ms(temporaryRange || ""))
      });
      return {
        ...additionalPrivilege,

        permissions: unpackPermissions(additionalPrivilege.permissions)
      };
    }

    const additionalPrivilege = await identityProjectAdditionalPrivilegeDAL.updateById(identityPrivilege.id, {
      ...data,
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
    if (!project) throw new NotFoundError({ message: "Project not found" });
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
      throw new ForbiddenRequestError({ message: "Failed to edit more privileged identity" });

    const identityPrivilege = await identityProjectAdditionalPrivilegeDAL.findOne({
      slug,
      projectMembershipId: identityProjectMembership.id
    });
    if (!identityPrivilege) throw new NotFoundError({ message: "Identity additional privilege not found" });

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
    if (!project) throw new NotFoundError({ message: "Project not found" });
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
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Identity);

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
    projectSlug
  }: TListIdentityPrivilegesDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new NotFoundError({ message: "Project not found" });
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
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Identity);

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
