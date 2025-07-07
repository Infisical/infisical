import { ForbiddenError, subject } from "@casl/ability";

import { ProjectMembershipRole } from "@app/db/schemas";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionIdentityActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError, PermissionBoundaryError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { ms } from "@app/lib/ms";

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
  TGetProjectIdentityByMembershipIdDTO,
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
    const { permission, membership } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityActions.Create,
      subject(ProjectPermissionSub.Identity, {
        identityId
      })
    );

    const existingIdentity = await identityProjectDAL.findOne({ identityId, projectId });
    if (existingIdentity)
      throw new BadRequestError({
        message: `Identity with ID ${identityId} already exists in project with ID ${projectId}`
      });

    const project = await projectDAL.findById(projectId);
    const identityOrgMembership = await identityOrgMembershipDAL.findOne({
      identityId,
      orgId: project.orgId
    });
    if (!identityOrgMembership)
      throw new NotFoundError({
        message: `Failed to find identity with ID ${identityId}`
      });

    for await (const { role: requestedRoleChange } of roles) {
      const { permission: rolePermission } = await permissionService.getProjectPermissionByRole(
        requestedRoleChange,
        projectId
      );

      if (requestedRoleChange !== ProjectMembershipRole.NoAccess) {
        const permissionBoundary = validatePrivilegeChangeOperation(
          membership.shouldUseNewPrivilegeSystem,
          ProjectPermissionIdentityActions.GrantPrivileges,
          ProjectPermissionSub.Identity,
          permission,
          rolePermission
        );
        if (!permissionBoundary.isValid)
          throw new PermissionBoundaryError({
            message: constructPermissionErrorMessage(
              "Failed to assign to role",
              membership.shouldUseNewPrivilegeSystem,
              ProjectPermissionIdentityActions.GrantPrivileges,
              ProjectPermissionSub.Identity
            ),
            details: { missingPermissions: permissionBoundary.missingPermissions }
          });
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
    if (customRoles.length !== customInputRoles.length)
      throw new NotFoundError({ message: "One or more custom project roles not found" });

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
    const { permission, membership } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityActions.Edit,
      subject(ProjectPermissionSub.Identity, { identityId })
    );

    const projectIdentity = await identityProjectDAL.findOne({ identityId, projectId });
    if (!projectIdentity)
      throw new NotFoundError({
        message: `Identity with ID ${identityId} doesn't exists in project with ID ${projectId}`
      });

    for await (const { role: requestedRoleChange } of roles) {
      const { permission: rolePermission } = await permissionService.getProjectPermissionByRole(
        requestedRoleChange,
        projectId
      );

      const permissionBoundary = validatePrivilegeChangeOperation(
        membership.shouldUseNewPrivilegeSystem,
        ProjectPermissionIdentityActions.GrantPrivileges,
        ProjectPermissionSub.Identity,
        permission,
        rolePermission
      );

      if (!permissionBoundary.isValid)
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "Failed to change role",
            membership.shouldUseNewPrivilegeSystem,
            ProjectPermissionIdentityActions.GrantPrivileges,
            ProjectPermissionSub.Identity
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
    }

    // validate custom roles input
    const customInputRoles = roles.filter(
      ({ role }) =>
        !Object.values(ProjectMembershipRole)
          // we don't want to include custom in this check;
          // this unintentionally enables setting slug to custom which is reserved
          .filter((r) => r !== ProjectMembershipRole.Custom)
          .includes(role as ProjectMembershipRole)
    );
    const hasCustomRole = Boolean(customInputRoles.length);
    const customRoles = hasCustomRole
      ? await projectRoleDAL.find({
          projectId,
          $in: { slug: customInputRoles.map(({ role }) => role) }
        })
      : [];
    if (customRoles.length !== customInputRoles.length)
      throw new NotFoundError({ message: "One or more custom project roles not found" });

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
    if (!identityProjectMembership) {
      throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityActions.Delete,
      subject(ProjectPermissionSub.Identity, { identityId })
    );

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
    orderDirection,
    search
  }: TListProjectIdentityDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityActions.Read,
      ProjectPermissionSub.Identity
    );

    const identityMemberships = await identityProjectDAL.findByProjectId(projectId, {
      limit,
      offset,
      orderBy,
      orderDirection,
      search
    });

    const totalCount = await identityProjectDAL.getCountByProjectId(projectId, { search });

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
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityActions.Read,
      subject(ProjectPermissionSub.Identity, { identityId })
    );

    const [identityMembership] = await identityProjectDAL.findByProjectId(projectId, { identityId });
    if (!identityMembership)
      throw new NotFoundError({
        message: `Project membership for identity with ID '${identityId} in project with ID '${projectId}' not found`
      });
    return identityMembership;
  };

  const getProjectIdentityByMembershipId = async ({
    identityMembershipId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TGetProjectIdentityByMembershipIdDTO) => {
    const membership = await identityProjectDAL.findOne({ id: identityMembershipId });

    if (!membership) {
      throw new NotFoundError({
        message: `Project membership with ID '${identityMembershipId}' not found`
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: membership.projectId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityActions.Read,
      subject(ProjectPermissionSub.Identity, { identityId: membership.identityId })
    );

    const [identityMembership] = await identityProjectDAL.findByProjectId(membership.projectId, {
      identityId: membership.identityId
    });

    return identityMembership;
  };

  return {
    createProjectIdentity,
    updateProjectIdentity,
    deleteProjectIdentity,
    listProjectIdentities,
    getProjectIdentityByIdentityId,
    getProjectIdentityByMembershipId
  };
};
