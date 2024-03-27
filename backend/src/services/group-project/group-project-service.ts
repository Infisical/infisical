import { ForbiddenError } from "@casl/ability";
import ms from "ms";

import { ProjectMembershipRole, SecretKeyEncoding } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { isAtLeastAsPrivileged } from "@app/lib/casl";
import { decryptAsymmetric, encryptAsymmetric } from "@app/lib/crypto";
import { infisicalSymmetricDecrypt } from "@app/lib/crypto/encryption";
import { BadRequestError, ForbiddenRequestError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";

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
  TListProjectGroupDTO,
  TUpdateProjectGroupDTO
} from "./group-project-types";

type TGroupProjectServiceFactoryDep = {
  groupProjectDAL: Pick<TGroupProjectDALFactory, "findOne" | "transaction" | "create" | "delete" | "findByProjectId">;
  groupProjectMembershipRoleDAL: Pick<
    TGroupProjectMembershipRoleDALFactory,
    "create" | "transaction" | "insertMany" | "delete"
  >;
  userGroupMembershipDAL: TUserGroupMembershipDALFactory;
  projectDAL: Pick<TProjectDALFactory, "findById" | "findProjectGhostUser">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "findLatestProjectKey" | "delete" | "insertMany" | "transaction">;
  projectRoleDAL: Pick<TProjectRoleDALFactory, "find">;
  projectBotDAL: TProjectBotDALFactory;
  groupDAL: Pick<TGroupDALFactory, "findOne">;
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
  const createProjectGroup = async ({
    groupSlug,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId,
    role
  }: TCreateProjectGroupDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.Groups);

    const group = await groupDAL.findOne({ orgId: actorOrgId, slug: groupSlug });
    if (!group) throw new BadRequestError({ message: `Failed to find group with slug ${groupSlug}` });

    const existingGroup = await groupProjectDAL.findOne({ groupId: group.id, projectId });
    if (existingGroup)
      throw new BadRequestError({
        message: `Group with slug ${groupSlug} already exists in project with id ${projectId}`
      });

    const project = await projectDAL.findById(projectId);

    const { permission: rolePermission, role: customRole } = await permissionService.getProjectPermissionByRole(
      role,
      project.id
    );
    const hasPriviledge = isAtLeastAsPrivileged(permission, rolePermission);
    if (!hasPriviledge)
      throw new ForbiddenRequestError({
        message: "Failed to add group to project with more privileged role"
      });
    const isCustomRole = Boolean(customRole);

    const projectGroup = await groupProjectDAL.transaction(async (tx) => {
      const groupProjectMembership = await groupProjectDAL.create(
        {
          groupId: group.id,
          projectId: project.id,
          role: isCustomRole ? ProjectMembershipRole.Custom : role,
          roleId: customRole?.id
        },
        tx
      );

      await groupProjectMembershipRoleDAL.create(
        {
          projectMembershipId: groupProjectMembership.id,
          role: isCustomRole ? ProjectMembershipRole.Custom : role,
          customRoleId: customRole?.id
        },
        tx
      );
      return groupProjectMembership;
    });

    // share project key with users in group that have not
    // individually been added to the project and that are not part of
    // other groups that are in the project
    const groupMembers = await userGroupMembershipDAL.findGroupMembersNotInProject(group.id, projectId);

    if (groupMembers.length) {
      const ghostUser = await projectDAL.findProjectGhostUser(projectId);

      if (!ghostUser) {
        throw new BadRequestError({
          message: "Failed to find sudo user"
        });
      }

      const ghostUserLatestKey = await projectKeyDAL.findLatestProjectKey(ghostUser.id, projectId);

      if (!ghostUserLatestKey) {
        throw new BadRequestError({
          message: "Failed to find sudo user latest key"
        });
      }

      const bot = await projectBotDAL.findOne({ projectId });

      if (!bot) {
        throw new BadRequestError({
          message: "Failed to find bot"
        });
      }

      const botPrivateKey = infisicalSymmetricDecrypt({
        keyEncoding: bot.keyEncoding as SecretKeyEncoding,
        iv: bot.iv,
        tag: bot.tag,
        ciphertext: bot.encryptedPrivateKey
      });

      const plaintextProjectKey = decryptAsymmetric({
        ciphertext: ghostUserLatestKey.encryptedKey,
        nonce: ghostUserLatestKey.nonce,
        publicKey: ghostUserLatestKey.sender.publicKey,
        privateKey: botPrivateKey
      });

      const projectKeyData = groupMembers.map(({ user: { publicKey, id } }) => {
        const { ciphertext: encryptedKey, nonce } = encryptAsymmetric(plaintextProjectKey, publicKey, botPrivateKey);

        return {
          encryptedKey,
          nonce,
          senderId: ghostUser.id,
          receiverId: id,
          projectId
        };
      });

      await projectKeyDAL.insertMany(projectKeyData);
    }

    return projectGroup;
  };

  const updateProjectGroup = async ({
    projectId,
    groupSlug,
    roles,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TUpdateProjectGroupDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Groups);

    const group = await groupDAL.findOne({ orgId: actorOrgId, slug: groupSlug });
    if (!group) throw new BadRequestError({ message: `Failed to find group with slug ${groupSlug}` });

    const projectGroup = await groupProjectDAL.findOne({ groupId: group.id, projectId });
    if (!projectGroup) throw new BadRequestError({ message: `Failed to find group with slug ${groupSlug}` });

    const { permission: groupRolePermission } = await permissionService.getProjectPermissionByRole(
      projectGroup.role,
      projectId
    );

    const hasRequiredPriviledges = isAtLeastAsPrivileged(permission, groupRolePermission);
    if (!hasRequiredPriviledges) throw new ForbiddenRequestError({ message: "Failed to delete more privileged group" });

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

    const santiziedProjectMembershipRoles = roles.map((inputRole) => {
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
      return groupProjectMembershipRoleDAL.insertMany(santiziedProjectMembershipRoles, tx);
    });

    return updatedRoles;
  };

  const deleteProjectGroup = async ({
    groupSlug,
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    projectId
  }: TDeleteProjectGroupDTO) => {
    const group = await groupDAL.findOne({ orgId: actorOrgId, slug: groupSlug });
    if (!group) throw new BadRequestError({ message: `Failed to find group with slug ${groupSlug}` });

    const groupProjectMembership = await groupProjectDAL.findOne({ groupId: group.id, projectId });
    if (!groupProjectMembership) throw new BadRequestError({ message: `Failed to find group with slug ${groupSlug}` });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.Groups);
    const { permission: groupRolePermission } = await permissionService.getProjectPermissionByRole(
      groupProjectMembership.role,
      projectId
    );
    const hasRequiredPriviledges = isAtLeastAsPrivileged(permission, groupRolePermission);
    if (!hasRequiredPriviledges) throw new ForbiddenRequestError({ message: "Failed to delete more privileged group" });

    const groupMembers = await userGroupMembershipDAL.findGroupMembersNotInProject(group.id, projectId);

    if (groupMembers.length) {
      await projectKeyDAL.delete({
        projectId,
        $in: {
          receiverId: groupMembers.map(({ user: { id } }) => id)
        }
      });
    }

    const [deletedGroup] = await groupProjectDAL.delete({ groupId: group.id, projectId });

    return deletedGroup;
  };

  const listProjectGroup = async ({ projectId, actor, actorId, actorAuthMethod, actorOrgId }: TListProjectGroupDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Groups);

    const groupMemberhips = await groupProjectDAL.findByProjectId(projectId);
    return groupMemberhips;
  };

  return {
    createProjectGroup,
    updateProjectGroup,
    deleteProjectGroup,
    listProjectGroup
  };
};
