import { ForbiddenError } from "@casl/ability";

import { ActionProjectType, ProjectMembershipRole, TIdentityGroupProjectMemberships } from "@app/db/schemas";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionGroupActions,
  ProjectPermissionIdentityGroupActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError, PermissionBoundaryError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { ms } from "@app/lib/ms";
import { isUuidV4 } from "@app/lib/validator";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { ProjectUserMembershipTemporaryMode } from "@app/services/project-membership/project-membership-types";
import { TProjectRoleDALFactory } from "@app/services/project-role/project-role-dal";

import { TIdentityGroupDALFactory } from "../identity-group/identity-group-dal";
import { TIdentityGroupProjectDALFactory } from "../identity-group/identity-group-project-membership-dal";
import { TIdentityGroupProjectMembershipRoleDALFactory } from "../identity-group/identity-group-project-membership-role-dal";
import {
  TCreateIdentityGroupProjectDTO,
  TGetIdentityGroupInProjectDTO,
  TListIdentityGroupsInProjectDTO,
  TListProjectIdentityGroupUsersDTO,
  TRemoveIdentityGroupFromProjectDTO,
  TUpdateIdentityGroupInProjectDTO
} from "./identity-group-project-types";

type TIdentityGroupProjectServiceFactoryDep = {
  identityGroupDAL: Pick<TIdentityGroupDALFactory, "findOne" | "findAllIdentityGroupPossibleMembers">;
  identityGroupProjectDAL: TIdentityGroupProjectDALFactory;
  identityGroupProjectMembershipRoleDAL: Pick<
    TIdentityGroupProjectMembershipRoleDALFactory,
    "create" | "transaction" | "insertMany" | "delete"
  >;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  projectRoleDAL: Pick<TProjectRoleDALFactory, "find">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getProjectPermissionByRole">;
};

export type TIdentityGroupProjectServiceFactory = ReturnType<typeof identityGroupProjectServiceFactory>;

export const identityGroupProjectServiceFactory = ({
  identityGroupDAL,
  identityGroupProjectDAL,
  identityGroupProjectMembershipRoleDAL,
  projectDAL,
  projectRoleDAL,
  permissionService
}: TIdentityGroupProjectServiceFactoryDep) => {
  const addGroupToProject = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    roles,
    projectId,
    groupIdOrName
  }: TCreateIdentityGroupProjectDTO) => {
    const project = await projectDAL.findById(projectId);
    if (!project) throw new NotFoundError({ message: `Failed to find project with ID ${projectId}` });
    if (project.version < 2) throw new BadRequestError({ message: `Failed to add identity group to E2EE project` });

    const { permission, membership } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityGroupActions.Create,
      ProjectPermissionSub.IdentityGroups
    );

    let group = null;
    if (isUuidV4(groupIdOrName)) {
      group = await identityGroupDAL.findOne({ orgId: actorOrgId, id: groupIdOrName });
    }
    if (!group) {
      group = await identityGroupDAL.findOne({ orgId: actorOrgId, name: groupIdOrName });
    }

    if (!group) throw new NotFoundError({ message: `Failed to find identity group with ID or name ${groupIdOrName}` });

    const existingGroup = await identityGroupProjectDAL.findOne({ groupId: group.id, projectId: project.id });
    if (existingGroup)
      throw new BadRequestError({
        message: `Identity group with ID ${group.id} already exists in project with id ${project.id}`
      });

    const customRoles = await projectRoleDAL.find({ projectId });
    const customRolesGroupBySlug = groupBy(customRoles, ({ slug }) => slug);
    for await (const { role: requestedRoleChange } of roles) {
      const isCustomRole = Boolean(customRolesGroupBySlug?.[requestedRoleChange]?.[0]);
      const { permission: rolePermission } = await permissionService.getProjectPermissionByRole(
        isCustomRole ? ProjectMembershipRole.Custom : requestedRoleChange,
        project.id
      );

      const hasRequiredPrivileges = permission.can(
        ProjectPermissionIdentityGroupActions.Create,
        ProjectPermissionSub.IdentityGroups
      );
      if (!hasRequiredPrivileges) {
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "assign role",
            membership.shouldUseNewPrivilegeSystem,
            ProjectPermissionIdentityGroupActions.Create,
            ProjectPermissionSub.IdentityGroups
          )
        });
      }

      if (requestedRoleChange !== ProjectMembershipRole.NoAccess) {
        const permissionBoundary = validatePrivilegeChangeOperation(
          membership.shouldUseNewPrivilegeSystem,
          ProjectPermissionIdentityGroupActions.Create,
          ProjectPermissionSub.IdentityGroups,
          permission,
          rolePermission
        );
        if (!permissionBoundary.isValid)
          throw new PermissionBoundaryError({
            message: constructPermissionErrorMessage(
              "Failed to assign role",
              membership.shouldUseNewPrivilegeSystem,
              ProjectPermissionGroupActions.Create,
              ProjectPermissionSub.IdentityGroups
            ),
            details: { missingPermissions: permissionBoundary.missingPermissions }
          });
      }
    }

    const identityGroupMembership = await identityGroupProjectDAL.transaction(async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const groupMembership: TIdentityGroupProjectMemberships = await identityGroupProjectDAL.create(
        {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          groupId: group!.id,
          projectId: project.id
        },
        tx
      );

      const sanitizedProjectMembershipRoles = roles.map((inputRole) => {
        const isCustomRole = Boolean(customRolesGroupBySlug?.[inputRole.role]?.[0]);
        if (!inputRole.isTemporary) {
          return {
            projectMembershipId: groupMembership.id,
            role: isCustomRole ? ProjectMembershipRole.Custom : inputRole.role,
            customRoleId: customRolesGroupBySlug[inputRole.role]?.[0]?.id || null
          };
        }

        // check cron or relative here later for now its just relative
        const relativeTimeInMs = ms(inputRole.temporaryRange!);
        return {
          projectMembershipId: groupMembership.id,
          role: isCustomRole ? ProjectMembershipRole.Custom : inputRole.role,
          customRoleId: customRolesGroupBySlug[inputRole.role] ? customRolesGroupBySlug[inputRole.role][0].id : null,
          isTemporary: true,
          temporaryMode: ProjectUserMembershipTemporaryMode.Relative,
          temporaryRange: inputRole.temporaryRange,
          temporaryAccessStartTime: new Date(inputRole.temporaryAccessStartTime!),
          temporaryAccessEndTime: new Date(new Date(inputRole.temporaryAccessStartTime!).getTime() + relativeTimeInMs)
        };
      });

      const identityRoles = await identityGroupProjectMembershipRoleDAL.insertMany(sanitizedProjectMembershipRoles, tx);
      return { ...groupMembership, roles: identityRoles };
    });

    return identityGroupMembership;
  };

  const updateIdentityGroupInProject = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId,
    groupId,
    roles
  }: TUpdateIdentityGroupInProjectDTO) => {
    const project = await projectDAL.findById(projectId);
    if (!project) throw new NotFoundError({ message: `Failed to find project with ID ${projectId}` });

    const { permission, membership } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityGroupActions.Edit,
      ProjectPermissionSub.IdentityGroups
    );

    const [existingGroupMembership] = await identityGroupProjectDAL.findByProjectId(project.id, {
      groupId
    });
    if (!existingGroupMembership) {
      throw new NotFoundError({
        message: `Identity group membership with ID ${groupId} not found in project with ID ${projectId}`
      });
    }

    const customRoles = await projectRoleDAL.find({ projectId });
    const customRolesGroupBySlug = groupBy(customRoles, ({ slug }) => slug);

    for await (const { role: requestedRoleChange } of roles) {
      const isCustomRole = Boolean(customRolesGroupBySlug?.[requestedRoleChange]?.[0]);
      const { permission: rolePermission } = await permissionService.getProjectPermissionByRole(
        isCustomRole ? ProjectMembershipRole.Custom : requestedRoleChange,
        project.id
      );

      const hasRequiredPrivileges = permission.can(
        ProjectPermissionIdentityGroupActions.Edit,
        ProjectPermissionSub.IdentityGroups
      );
      if (!hasRequiredPrivileges) {
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "assign role",
            membership.shouldUseNewPrivilegeSystem,
            ProjectPermissionIdentityGroupActions.Edit,
            ProjectPermissionSub.IdentityGroups
          )
        });
      }

      if (requestedRoleChange !== ProjectMembershipRole.NoAccess) {
        const permissionBoundary = validatePrivilegeChangeOperation(
          membership.shouldUseNewPrivilegeSystem,
          ProjectPermissionIdentityGroupActions.Edit,
          ProjectPermissionSub.IdentityGroups,
          permission,
          rolePermission
        );
        if (!permissionBoundary.isValid)
          throw new PermissionBoundaryError({
            message: constructPermissionErrorMessage(
              "Failed to assign role",
              membership.shouldUseNewPrivilegeSystem,
              ProjectPermissionIdentityGroupActions.Edit,
              ProjectPermissionSub.IdentityGroups
            ),
            details: { missingPermissions: permissionBoundary.missingPermissions }
          });
      }
    }

    const updatedRoles = await identityGroupProjectMembershipRoleDAL.transaction(async (tx) => {
      await identityGroupProjectMembershipRoleDAL.delete({ projectMembershipId: existingGroupMembership.id }, tx);

      const sanitizedProjectMembershipRoles = roles.map((inputRole) => {
        const isCustomRole = Boolean(customRolesGroupBySlug?.[inputRole.role]?.[0]);
        if (!inputRole.isTemporary) {
          return {
            projectMembershipId: existingGroupMembership.id,
            role: isCustomRole ? ProjectMembershipRole.Custom : inputRole.role,
            customRoleId: customRolesGroupBySlug[inputRole.role]?.[0]?.id || null
          };
        }

        // check cron or relative here later for now its just relative
        const relativeTimeInMs = ms(inputRole.temporaryRange!);
        return {
          projectMembershipId: existingGroupMembership.id,
          role: isCustomRole ? ProjectMembershipRole.Custom : inputRole.role,
          customRoleId: customRolesGroupBySlug[inputRole.role] ? customRolesGroupBySlug[inputRole.role][0].id : null,
          isTemporary: true,
          temporaryMode: ProjectUserMembershipTemporaryMode.Relative,
          temporaryRange: inputRole.temporaryRange,
          temporaryAccessStartTime: new Date(inputRole.temporaryAccessStartTime!),
          temporaryAccessEndTime: new Date(new Date(inputRole.temporaryAccessStartTime!).getTime() + relativeTimeInMs)
        };
      });

      const identityRoles = await identityGroupProjectMembershipRoleDAL.insertMany(sanitizedProjectMembershipRoles, tx);
      return identityRoles;
    });

    return updatedRoles;
  };

  const removeIdentityGroupFromProject = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId,
    groupId
  }: TRemoveIdentityGroupFromProjectDTO) => {
    const project = await projectDAL.findById(projectId);
    if (!project) throw new NotFoundError({ message: `Failed to find project with ID ${projectId}` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityGroupActions.Delete,
      ProjectPermissionSub.IdentityGroups
    );

    const [existingGroupMembership] = await identityGroupProjectDAL.findByProjectId(project.id, {
      groupId
    });
    if (!existingGroupMembership) {
      throw new NotFoundError({
        message: `Identity group membership with ID ${groupId} not found in project with ID ${projectId}`
      });
    }

    const deletedGroupMembership = await identityGroupProjectDAL.transaction(async (tx) => {
      await identityGroupProjectMembershipRoleDAL.delete({ projectMembershipId: existingGroupMembership.id }, tx);
      const groupMembership = await identityGroupProjectDAL.deleteById(existingGroupMembership.id, tx);
      return groupMembership;
    });

    return deletedGroupMembership;
  };

  const listIdentityGroupsInProject = async ({
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TListIdentityGroupsInProjectDTO) => {
    const project = await projectDAL.findById(projectId);

    if (!project) {
      throw new NotFoundError({ message: `Failed to find project with ID ${projectId}` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityGroupActions.Read,
      ProjectPermissionSub.IdentityGroups
    );

    const identityGroupMemberships = await identityGroupProjectDAL.findByProjectId(project.id);
    return identityGroupMemberships;
  };

  const getIdentityGroupInProject = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    groupId,
    projectId
  }: TGetIdentityGroupInProjectDTO) => {
    const project = await projectDAL.findById(projectId);

    if (!project) {
      throw new NotFoundError({ message: `Failed to find project with ID ${projectId}` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityGroupActions.Read,
      ProjectPermissionSub.IdentityGroups
    );

    const [identityGroupMembership] = await identityGroupProjectDAL.findByProjectId(project.id, {
      groupId
    });

    if (!identityGroupMembership) {
      throw new NotFoundError({
        message: `Identity group membership with ID ${groupId} not found in project with ID ${projectId}`
      });
    }

    return identityGroupMembership;
  };

  const listProjectIdentityGroupUsers = async ({
    id,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    offset = 0,
    limit = 10,
    search,
    filter
  }: TListProjectIdentityGroupUsersDTO) => {
    if (!actorOrgId) throw new BadRequestError({ message: "Organization ID is required" });
    const project = await projectDAL.findById(projectId);

    if (!project) {
      throw new NotFoundError({ message: `Failed to find project with ID ${projectId}` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityGroupActions.Read,
      ProjectPermissionSub.IdentityGroups
    );

    const group = await identityGroupDAL.findOne({ id, orgId: actorOrgId });
    if (!group) {
      throw new NotFoundError({ message: `Failed to find identity group with ID ${id}` });
    }

    const { members, totalCount } = await identityGroupDAL.findAllIdentityGroupPossibleMembers({
      orgId: actorOrgId,
      groupId: id,
      offset,
      limit,
      search,
      filter
    });

    return { users: members, totalCount };
  };

  return {
    addGroupToProject,
    updateIdentityGroupInProject,
    removeIdentityGroupFromProject,
    listIdentityGroupsInProject,
    getIdentityGroupInProject,
    listProjectIdentityGroupUsers
  };
};
