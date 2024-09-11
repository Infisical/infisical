import { ForbiddenError } from "@casl/ability";
import ms from "ms";

import { ProjectMembershipRole } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { isAtLeastAsPrivileged } from "@app/lib/casl";
import { BadRequestError, ForbiddenRequestError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";

import { ActorType } from "../auth/auth-type";
import { TIdentityOrgDALFactory } from "../identity/identity-org-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { ProjectUserMembershipTemporaryMode } from "../project-membership/project-membership-types";
import { TProjectRoleDALFactory } from "../project-role/project-role-dal";
import { TIdentityProjectDALFactory } from "./identity-project-dal";
import { TIdentityProjectMembershipRoleDALFactory } from "./identity-project-membership-role-dal";
import {
  TCreateProjectIdentityDTO,
  TDeleteProjectIdentityDTO,
  TGetProjectIdentityByIdentityIdDTO,
  TListProjectIdentityDTO,
  TUpdateProjectIdentityDTO
} from "./identity-project-types";

type TIdentityProjectServiceFactoryDep = {
  identityProjectDAL: TIdentityProjectDALFactory;
  identityProjectMembershipRoleDAL: Pick<
    TIdentityProjectMembershipRoleDALFactory,
    "create" | "transaction" | "insertMany" | "delete"
  >;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  projectRoleDAL: Pick<TProjectRoleDALFactory, "find">;
  identityOrgMembershipDAL: Pick<TIdentityOrgDALFactory, "findOne">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getProjectPermissionByRole">;
};

export type TIdentityProjectServiceFactory = ReturnType<typeof identityProjectServiceFactory>;

export const identityProjectServiceFactory = ({
  identityProjectDAL,
  permissionService,
  identityOrgMembershipDAL,
  identityProjectMembershipRoleDAL,
  projectDAL,
  projectRoleDAL
}: TIdentityProjectServiceFactoryDep) => {
  const createProjectIdentity = async ({
    identityId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId,
    roles
  }: TCreateProjectIdentityDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.Identity);

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

    for await (const { role: requestedRoleChange } of roles) {
      const { permission: rolePermission } = await permissionService.getProjectPermissionByRole(
        requestedRoleChange,
        projectId
      );

      const hasRequiredPriviledges = isAtLeastAsPrivileged(permission, rolePermission);

      if (!hasRequiredPriviledges) {
        throw new ForbiddenRequestError({ message: "Failed to change to a more privileged role" });
      }
    }

    // validate custom roles input
    const customInputRoles = roles.filter(
      ({ role }) => !Object.values(ProjectMembershipRole).includes(role as ProjectMembershipRole)
    );
    const hasCustomRole = Boolean(customInputRoles.length);
    const customRoles = hasCustomRole
      ? await projectRoleDAL.find({
          projectId,
          $in: { slug: customInputRoles.map(({ role }) => role) }
        })
      : [];
    if (customRoles.length !== customInputRoles.length) throw new BadRequestError({ message: "Custom role not found" });

    const customRolesGroupBySlug = groupBy(customRoles, ({ slug }) => slug);
    const projectIdentity = await identityProjectDAL.transaction(async (tx) => {
      const identityProjectMembership = await identityProjectDAL.create(
        {
          identityId,
          projectId: project.id
        },
        tx
      );
      const sanitizedProjectMembershipRoles = roles.map((inputRole) => {
        const isCustomRole = Boolean(customRolesGroupBySlug?.[inputRole.role]?.[0]);
        if (!inputRole.isTemporary) {
          return {
            projectMembershipId: identityProjectMembership.id,
            role: isCustomRole ? ProjectMembershipRole.Custom : inputRole.role,
            customRoleId: customRolesGroupBySlug[inputRole.role] ? customRolesGroupBySlug[inputRole.role][0].id : null
          };
        }

        // check cron or relative here later for now its just relative
        const relativeTimeInMs = ms(inputRole.temporaryRange);
        return {
          projectMembershipId: identityProjectMembership.id,
          role: isCustomRole ? ProjectMembershipRole.Custom : inputRole.role,
          customRoleId: customRolesGroupBySlug[inputRole.role] ? customRolesGroupBySlug[inputRole.role][0].id : null,
          isTemporary: true,
          temporaryMode: ProjectUserMembershipTemporaryMode.Relative,
          temporaryRange: inputRole.temporaryRange,
          temporaryAccessStartTime: new Date(inputRole.temporaryAccessStartTime),
          temporaryAccessEndTime: new Date(new Date(inputRole.temporaryAccessStartTime).getTime() + relativeTimeInMs)
        };
      });

      const identityRoles = await identityProjectMembershipRoleDAL.insertMany(sanitizedProjectMembershipRoles, tx);
      return { ...identityProjectMembership, roles: identityRoles };
    });
    return projectIdentity;
  };

  const updateProjectIdentity = async ({
    projectId,
    identityId,
    roles,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TUpdateProjectIdentityDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Identity);

    const projectIdentity = await identityProjectDAL.findOne({ identityId, projectId });
    if (!projectIdentity)
      throw new BadRequestError({
        message: `Identity with id ${identityId} doesn't exists in project with id ${projectId}`
      });

    for await (const { role: requestedRoleChange } of roles) {
      const { permission: rolePermission } = await permissionService.getProjectPermissionByRole(
        requestedRoleChange,
        projectId
      );

      const hasRequiredPriviledges = isAtLeastAsPrivileged(permission, rolePermission);

      if (!hasRequiredPriviledges) {
        throw new ForbiddenRequestError({ message: "Failed to change to a more privileged role" });
      }
    }

    // validate custom roles input
    const customInputRoles = roles.filter(
      ({ role }) => !Object.values(ProjectMembershipRole).includes(role as ProjectMembershipRole)
    );
    const hasCustomRole = Boolean(customInputRoles.length);
    const customRoles = hasCustomRole
      ? await projectRoleDAL.find({
          projectId,
          $in: { slug: customInputRoles.map(({ role }) => role) }
        })
      : [];
    if (customRoles.length !== customInputRoles.length) throw new BadRequestError({ message: "Custom role not found" });

    const customRolesGroupBySlug = groupBy(customRoles, ({ slug }) => slug);

    const sanitizedProjectMembershipRoles = roles.map((inputRole) => {
      const isCustomRole = Boolean(customRolesGroupBySlug?.[inputRole.role]?.[0]);
      if (!inputRole.isTemporary) {
        return {
          projectMembershipId: projectIdentity.id,
          role: isCustomRole ? ProjectMembershipRole.Custom : inputRole.role,
          customRoleId: customRolesGroupBySlug[inputRole.role] ? customRolesGroupBySlug[inputRole.role][0].id : null
        };
      }

      // check cron or relative here later for now its just relative
      const relativeTimeInMs = ms(inputRole.temporaryRange);
      return {
        projectMembershipId: projectIdentity.id,
        role: isCustomRole ? ProjectMembershipRole.Custom : inputRole.role,
        customRoleId: customRolesGroupBySlug[inputRole.role] ? customRolesGroupBySlug[inputRole.role][0].id : null,
        isTemporary: true,
        temporaryMode: ProjectUserMembershipTemporaryMode.Relative,
        temporaryRange: inputRole.temporaryRange,
        temporaryAccessStartTime: new Date(inputRole.temporaryAccessStartTime),
        temporaryAccessEndTime: new Date(new Date(inputRole.temporaryAccessStartTime).getTime() + relativeTimeInMs)
      };
    });

    const updatedRoles = await identityProjectMembershipRoleDAL.transaction(async (tx) => {
      await identityProjectMembershipRoleDAL.delete({ projectMembershipId: projectIdentity.id }, tx);
      return identityProjectMembershipRoleDAL.insertMany(sanitizedProjectMembershipRoles, tx);
    });

    return updatedRoles;
  };

  const deleteProjectIdentity = async ({
    identityId,
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    projectId
  }: TDeleteProjectIdentityDTO) => {
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
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.Identity);
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

    const [deletedIdentity] = await identityProjectDAL.delete({ identityId, projectId });
    return deletedIdentity;
  };

  const listProjectIdentities = async ({
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    limit,
    offset,
    orderBy,
    direction,
    textFilter
  }: TListProjectIdentityDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Identity);

    const identityMemberships = await identityProjectDAL.findByProjectId(projectId, {
      limit,
      offset,
      orderBy,
      direction,
      textFilter
    });

    const totalCount = await identityProjectDAL.getCountByProjectId(projectId, { textFilter });

    return { identityMemberships, totalCount };
  };

  const getProjectIdentityByIdentityId = async ({
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    identityId
  }: TGetProjectIdentityByIdentityIdDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Identity);

    const [identityMembership] = await identityProjectDAL.findByProjectId(projectId, { identityId });
    if (!identityMembership) throw new BadRequestError({ message: `Membership not found for identity ${identityId}` });
    return identityMembership;
  };

  return {
    createProjectIdentity,
    updateProjectIdentity,
    deleteProjectIdentity,
    listProjectIdentities,
    getProjectIdentityByIdentityId
  };
};
