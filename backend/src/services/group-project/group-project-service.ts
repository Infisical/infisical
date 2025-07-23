import { ForbiddenError } from "@casl/ability";

import { ActionProjectType, ProjectMembershipRole, SecretKeyEncoding, TGroups } from "@app/db/schemas";
import { TListProjectGroupUsersDTO } from "@app/ee/services/group/group-types";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionGroupActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, NotFoundError, PermissionBoundaryError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { ms } from "@app/lib/ms";
import { isUuidV4 } from "@app/lib/validator";

import { TGroupDALFactory } from "../../ee/services/group/group-dal";
import { TUserGroupMembershipDALFactory } from "../../ee/services/group/user-group-membership-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { TProjectBotDALFactory } from "../project-bot/project-bot-dal";
import { TProjectKeyDALFactory } from "../project-key/project-key-dal";
import { ProjectUserMembershipTemporaryMode } from "../project-membership/project-membership-types";
import { TProjectRoleDALFactory } from "../project-role/project-role-dal";
import { TGroupProjectDALFactory } from "./group-project-dal";
import { TGroupProjectMembershipRoleDALFactory } from "./group-project-membership-role-dal";
import {
  TCreateProjectGroupDTO,
  TDeleteProjectGroupDTO,
  TGetGroupInProjectDTO,
  TListProjectGroupDTO,
  TUpdateProjectGroupDTO
} from "./group-project-types";

type TGroupProjectServiceFactoryDep = {
  groupProjectDAL: Pick<TGroupProjectDALFactory, "findOne" | "transaction" | "create" | "delete" | "findByProjectId">;
  groupProjectMembershipRoleDAL: Pick<
    TGroupProjectMembershipRoleDALFactory,
    "create" | "transaction" | "insertMany" | "delete"
  >;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "findGroupMembersNotInProject">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "findProjectGhostUser" | "findById">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "findLatestProjectKey" | "delete" | "insertMany" | "transaction">;
  projectRoleDAL: Pick<TProjectRoleDALFactory, "find">;
  projectBotDAL: TProjectBotDALFactory;
  groupDAL: Pick<TGroupDALFactory, "findOne" | "findAllGroupPossibleMembers">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getProjectPermissionByRole">;
};

export type TGroupProjectServiceFactory = ReturnType<typeof groupProjectServiceFactory>;

export const groupProjectServiceFactory = ({
  groupDAL,
  groupProjectDAL,
  groupProjectMembershipRoleDAL,
  userGroupMembershipDAL,
  projectDAL,
  projectKeyDAL,
  projectBotDAL,
  projectRoleDAL,
  permissionService
}: TGroupProjectServiceFactoryDep) => {
  const addGroupToProject = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    roles,
    projectId,
    groupIdOrName
  }: TCreateProjectGroupDTO) => {
    const project = await projectDAL.findById(projectId);

    if (!project) throw new NotFoundError({ message: `Failed to find project with ID ${projectId}` });
    if (project.version < 2) throw new BadRequestError({ message: `Failed to add group to E2EE project` });

    const { permission, membership } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionGroupActions.Create, ProjectPermissionSub.Groups);

    let group: TGroups | null = null;
    if (isUuidV4(groupIdOrName)) {
      group = await groupDAL.findOne({ orgId: actorOrgId, id: groupIdOrName });
    }
    if (!group) {
      group = await groupDAL.findOne({ orgId: actorOrgId, name: groupIdOrName });
    }

    if (!group) throw new NotFoundError({ message: `Failed to find group with ID or name ${groupIdOrName}` });

    const existingGroup = await groupProjectDAL.findOne({ groupId: group.id, projectId: project.id });
    if (existingGroup)
      throw new BadRequestError({
        message: `Group with ID ${group.id} already exists in project with id ${project.id}`
      });

    for await (const { role: requestedRoleChange } of roles) {
      const { permission: rolePermission } = await permissionService.getProjectPermissionByRole(
        requestedRoleChange,
        project.id
      );

      const permissionBoundary = validatePrivilegeChangeOperation(
        membership.shouldUseNewPrivilegeSystem,
        ProjectPermissionGroupActions.GrantPrivileges,
        ProjectPermissionSub.Groups,
        permission,
        rolePermission
      );
      if (!permissionBoundary.isValid)
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "Failed to assign group to role",
            membership.shouldUseNewPrivilegeSystem,
            ProjectPermissionGroupActions.GrantPrivileges,
            ProjectPermissionSub.Groups
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
    }

    // validate custom roles input
    const customInputRoles = roles.filter(
      ({ role }) => !Object.values(ProjectMembershipRole).includes(role as ProjectMembershipRole)
    );
    const hasCustomRole = Boolean(customInputRoles.length);
    const customRoles = hasCustomRole
      ? await projectRoleDAL.find({
          projectId: project.id,
          $in: { slug: customInputRoles.map(({ role }) => role) }
        })
      : [];

    if (customRoles.length !== customInputRoles.length) {
      const customRoleSlugs = customRoles.map((customRole) => customRole.slug);
      const missingInputRoles = customInputRoles
        .filter((inputRole) => !customRoleSlugs.includes(inputRole.role))
        .map((role) => role.role);

      throw new NotFoundError({
        message: `Custom role/s not found: ${missingInputRoles.join(", ")}`
      });
    }
    const customRolesGroupBySlug = groupBy(customRoles, ({ slug }) => slug);

    const projectGroup = await groupProjectDAL.transaction(async (tx) => {
      const groupProjectMembership = await groupProjectDAL.create(
        {
          groupId: group!.id,
          projectId: project.id
        },
        tx
      );

      const sanitizedProjectMembershipRoles = roles.map((inputRole) => {
        const isCustomRole = Boolean(customRolesGroupBySlug?.[inputRole.role]?.[0]);
        if (!inputRole.isTemporary) {
          return {
            projectMembershipId: groupProjectMembership.id,
            role: isCustomRole ? ProjectMembershipRole.Custom : inputRole.role,
            customRoleId: customRolesGroupBySlug[inputRole.role] ? customRolesGroupBySlug[inputRole.role][0].id : null
          };
        }

        // check cron or relative here later for now its just relative
        const relativeTimeInMs = ms(inputRole.temporaryRange);
        return {
          projectMembershipId: groupProjectMembership.id,
          role: isCustomRole ? ProjectMembershipRole.Custom : inputRole.role,
          customRoleId: customRolesGroupBySlug[inputRole.role] ? customRolesGroupBySlug[inputRole.role][0].id : null,
          isTemporary: true,
          temporaryMode: ProjectUserMembershipTemporaryMode.Relative,
          temporaryRange: inputRole.temporaryRange,
          temporaryAccessStartTime: new Date(inputRole.temporaryAccessStartTime),
          temporaryAccessEndTime: new Date(new Date(inputRole.temporaryAccessStartTime).getTime() + relativeTimeInMs)
        };
      });

      await groupProjectMembershipRoleDAL.insertMany(sanitizedProjectMembershipRoles, tx);

      // share project key with users in group that have not
      // individually been added to the project and that are not part of
      // other groups that are in the project
      const groupMembers = await userGroupMembershipDAL.findGroupMembersNotInProject(group!.id, project.id, tx);

      if (groupMembers.length) {
        const ghostUser = await projectDAL.findProjectGhostUser(project.id, tx);

        if (!ghostUser) {
          throw new NotFoundError({
            message: `Failed to find project owner of project with name ${project.name}`
          });
        }

        const ghostUserLatestKey = await projectKeyDAL.findLatestProjectKey(ghostUser.id, project.id, tx);

        if (!ghostUserLatestKey) {
          throw new NotFoundError({
            message: `Failed to find project owner's latest key in project with name ${project.name}`
          });
        }

        const bot = await projectBotDAL.findOne({ projectId: project.id }, tx);

        if (!bot) {
          throw new NotFoundError({
            message: `Failed to find project bot in project with name ${project.name}`
          });
        }

        const botPrivateKey = crypto
          .encryption()
          .symmetric()
          .decryptWithRootEncryptionKey({
            keyEncoding: bot.keyEncoding as SecretKeyEncoding,
            iv: bot.iv,
            tag: bot.tag,
            ciphertext: bot.encryptedPrivateKey
          });

        const plaintextProjectKey = crypto.encryption().asymmetric().decrypt({
          ciphertext: ghostUserLatestKey.encryptedKey,
          nonce: ghostUserLatestKey.nonce,
          publicKey: ghostUserLatestKey.sender.publicKey,
          privateKey: botPrivateKey
        });

        const projectKeyData = groupMembers.map(({ user: { publicKey, id } }) => {
          const { ciphertext: encryptedKey, nonce } = crypto
            .encryption()
            .asymmetric()
            .encrypt(plaintextProjectKey, publicKey, botPrivateKey);

          return {
            encryptedKey,
            nonce,
            senderId: ghostUser.id,
            receiverId: id,
            projectId: project.id
          };
        });

        await projectKeyDAL.insertMany(projectKeyData, tx);
      }

      return groupProjectMembership;
    });

    return projectGroup;
  };

  const updateGroupInProject = async ({
    projectId,
    groupId,
    roles,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TUpdateProjectGroupDTO) => {
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
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionGroupActions.Edit, ProjectPermissionSub.Groups);

    const group = await groupDAL.findOne({ orgId: actorOrgId, id: groupId });
    if (!group) throw new NotFoundError({ message: `Failed to find group with ID ${groupId}` });

    const projectGroup = await groupProjectDAL.findOne({ groupId: group.id, projectId: project.id });
    if (!projectGroup) throw new NotFoundError({ message: `Failed to find group with ID ${groupId}` });

    for await (const { role: requestedRoleChange } of roles) {
      const { permission: rolePermission } = await permissionService.getProjectPermissionByRole(
        requestedRoleChange,
        project.id
      );
      const permissionBoundary = validatePrivilegeChangeOperation(
        membership.shouldUseNewPrivilegeSystem,
        ProjectPermissionGroupActions.GrantPrivileges,
        ProjectPermissionSub.Groups,
        permission,
        rolePermission
      );
      if (!permissionBoundary.isValid)
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "Failed to assign group to role",
            membership.shouldUseNewPrivilegeSystem,
            ProjectPermissionGroupActions.GrantPrivileges,
            ProjectPermissionSub.Groups
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
    }

    // validate custom roles input
    const customInputRoles = roles.filter(
      ({ role }) => !Object.values(ProjectMembershipRole).includes(role as ProjectMembershipRole)
    );
    const hasCustomRole = Boolean(customInputRoles.length);
    const customRoles = hasCustomRole
      ? await projectRoleDAL.find({
          projectId: project.id,
          $in: { slug: customInputRoles.map(({ role }) => role) }
        })
      : [];
    if (customRoles.length !== customInputRoles.length) {
      const customRoleSlugs = customRoles.map((customRole) => customRole.slug);
      const missingInputRoles = customInputRoles
        .filter((inputRole) => !customRoleSlugs.includes(inputRole.role))
        .map((role) => role.role);

      throw new NotFoundError({
        message: `Custom role/s not found: ${missingInputRoles.join(", ")}`
      });
    }

    const customRolesGroupBySlug = groupBy(customRoles, ({ slug }) => slug);

    const sanitizedProjectMembershipRoles = roles.map((inputRole) => {
      const isCustomRole = Boolean(customRolesGroupBySlug?.[inputRole.role]?.[0]);
      if (!inputRole.isTemporary) {
        return {
          projectMembershipId: projectGroup.id,
          role: isCustomRole ? ProjectMembershipRole.Custom : inputRole.role,
          customRoleId: customRolesGroupBySlug[inputRole.role] ? customRolesGroupBySlug[inputRole.role][0].id : null
        };
      }

      // check cron or relative here later for now its just relative
      const relativeTimeInMs = ms(inputRole.temporaryRange);
      return {
        projectMembershipId: projectGroup.id,
        role: isCustomRole ? ProjectMembershipRole.Custom : inputRole.role,
        customRoleId: customRolesGroupBySlug[inputRole.role] ? customRolesGroupBySlug[inputRole.role][0].id : null,
        isTemporary: true,
        temporaryMode: ProjectUserMembershipTemporaryMode.Relative,
        temporaryRange: inputRole.temporaryRange,
        temporaryAccessStartTime: new Date(inputRole.temporaryAccessStartTime),
        temporaryAccessEndTime: new Date(new Date(inputRole.temporaryAccessStartTime).getTime() + relativeTimeInMs)
      };
    });

    const updatedRoles = await groupProjectMembershipRoleDAL.transaction(async (tx) => {
      await groupProjectMembershipRoleDAL.delete({ projectMembershipId: projectGroup.id }, tx);
      return groupProjectMembershipRoleDAL.insertMany(sanitizedProjectMembershipRoles, tx);
    });

    return updatedRoles;
  };

  const removeGroupFromProject = async ({
    projectId,
    groupId,
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod
  }: TDeleteProjectGroupDTO) => {
    const project = await projectDAL.findById(projectId);

    if (!project) throw new NotFoundError({ message: `Failed to find project with ID ${projectId}` });

    const group = await groupDAL.findOne({ orgId: actorOrgId, id: groupId });
    if (!group) throw new NotFoundError({ message: `Failed to find group with ID ${groupId}` });

    const groupProjectMembership = await groupProjectDAL.findOne({ groupId: group.id, projectId: project.id });
    if (!groupProjectMembership) throw new NotFoundError({ message: `Failed to find group with ID ${groupId}` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionGroupActions.Delete, ProjectPermissionSub.Groups);

    const deletedProjectGroup = await groupProjectDAL.transaction(async (tx) => {
      const groupMembers = await userGroupMembershipDAL.findGroupMembersNotInProject(group.id, project.id, tx);

      if (groupMembers.length) {
        await projectKeyDAL.delete(
          {
            projectId: project.id,
            $in: {
              receiverId: groupMembers.map(({ user: { id } }) => id)
            }
          },
          tx
        );
      }

      const [projectGroup] = await groupProjectDAL.delete({ groupId: group.id, projectId: project.id }, tx);
      return projectGroup;
    });

    return deletedProjectGroup;
  };

  const listGroupsInProject = async ({
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TListProjectGroupDTO) => {
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
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionGroupActions.Read, ProjectPermissionSub.Groups);

    const groupMemberships = await groupProjectDAL.findByProjectId(project.id);
    return groupMemberships;
  };

  const getGroupInProject = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    groupId,
    projectId
  }: TGetGroupInProjectDTO) => {
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
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionGroupActions.Read, ProjectPermissionSub.Groups);

    const [groupMembership] = await groupProjectDAL.findByProjectId(project.id, {
      groupId
    });

    if (!groupMembership) {
      throw new NotFoundError({
        message: `Group membership with ID ${groupId} not found in project with ID ${projectId}`
      });
    }

    return groupMembership;
  };

  const listProjectGroupUsers = async ({
    id,
    projectId,
    offset,
    limit,
    username,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    search,
    filter
  }: TListProjectGroupUsersDTO) => {
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
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionGroupActions.Read, ProjectPermissionSub.Groups);

    const { members, totalCount } = await groupDAL.findAllGroupPossibleMembers({
      orgId: project.orgId,
      groupId: id,
      offset,
      limit,
      username,
      search,
      filter
    });

    return { users: members, totalCount };
  };

  return {
    addGroupToProject,
    updateGroupInProject,
    removeGroupFromProject,
    listGroupsInProject,
    getGroupInProject,
    listProjectGroupUsers
  };
};
