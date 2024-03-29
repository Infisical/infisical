import { ForbiddenError } from "@casl/ability";
import slugify from "@sindresorhus/slugify";

import { OrgMembershipRole, SecretKeyEncoding, TOrgRoles } from "@app/db/schemas";
import { isAtLeastAsPrivileged } from "@app/lib/casl";
import { decryptAsymmetric, encryptAsymmetric, infisicalSymmetricDecrypt } from "@app/lib/crypto/encryption";
import { BadRequestError, ForbiddenRequestError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { TGroupProjectDALFactory } from "../../../services/group-project/group-project-dal";
import { TOrgDALFactory } from "../../../services/org/org-dal";
import { TProjectDALFactory } from "../../../services/project/project-dal";
import { TProjectBotDALFactory } from "../../../services/project-bot/project-bot-dal";
import { TProjectKeyDALFactory } from "../../../services/project-key/project-key-dal";
import { TUserDALFactory } from "../../../services/user/user-dal";
import { TLicenseServiceFactory } from "../license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service";
import { TGroupDALFactory } from "./group-dal";
import {
  TAddUserToGroupDTO,
  TCreateGroupDTO,
  TDeleteGroupDTO,
  TListGroupUsersDTO,
  TRemoveUserFromGroupDTO,
  TUpdateGroupDTO
} from "./group-types";
import { TUserGroupMembershipDALFactory } from "./user-group-membership-dal";

type TGroupServiceFactoryDep = {
  userDAL: Pick<TUserDALFactory, "findOne" | "findUserEncKeyByUsername">;
  groupDAL: Pick<TGroupDALFactory, "create" | "findOne" | "update" | "delete" | "findAllGroupMembers">;
  groupProjectDAL: Pick<TGroupProjectDALFactory, "find">;
  orgDAL: Pick<TOrgDALFactory, "findMembership">;
  userGroupMembershipDAL: Pick<
    TUserGroupMembershipDALFactory,
    "findOne" | "create" | "delete" | "filterProjectsByUserMembership"
  >;
  projectDAL: Pick<TProjectDALFactory, "findProjectGhostUser">;
  projectBotDAL: Pick<TProjectBotDALFactory, "findOne">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "find" | "create" | "delete" | "findLatestProjectKey">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getOrgPermissionByRole">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TGroupServiceFactory = ReturnType<typeof groupServiceFactory>;

export const groupServiceFactory = ({
  userDAL,
  groupDAL,
  groupProjectDAL,
  orgDAL,
  userGroupMembershipDAL,
  projectDAL,
  projectBotDAL,
  projectKeyDAL,
  permissionService,
  licenseService
}: TGroupServiceFactoryDep) => {
  const createGroup = async ({ name, slug, role, actor, actorId, actorAuthMethod, actorOrgId }: TCreateGroupDTO) => {
    if (!actorOrgId) throw new BadRequestError({ message: "Failed to create group without organization" });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Groups);

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.groups)
      throw new BadRequestError({
        message: "Failed to create group due to plan restriction. Upgrade plan to create group."
      });

    const { permission: rolePermission, role: customRole } = await permissionService.getOrgPermissionByRole(
      role,
      actorOrgId
    );
    const isCustomRole = Boolean(customRole);
    const hasRequiredPriviledges = isAtLeastAsPrivileged(permission, rolePermission);
    if (!hasRequiredPriviledges) throw new BadRequestError({ message: "Failed to create a more privileged group" });

    const group = await groupDAL.create({
      name,
      slug: slug || slugify(`${name}-${alphaNumericNanoId(4)}`),
      orgId: actorOrgId,
      role: isCustomRole ? OrgMembershipRole.Custom : role,
      roleId: customRole?.id
    });

    return group;
  };

  const updateGroup = async ({
    currentSlug,
    name,
    slug,
    role,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TUpdateGroupDTO) => {
    if (!actorOrgId) throw new BadRequestError({ message: "Failed to create group without organization" });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Groups);

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.groups)
      throw new BadRequestError({
        message: "Failed to update group due to plan restrictio Upgrade plan to update group."
      });

    const group = await groupDAL.findOne({ orgId: actorOrgId, slug: currentSlug });
    if (!group) throw new BadRequestError({ message: `Failed to find group with slug ${currentSlug}` });

    let customRole: TOrgRoles | undefined;
    if (role) {
      const { permission: rolePermission, role: customOrgRole } = await permissionService.getOrgPermissionByRole(
        role,
        group.orgId
      );

      const isCustomRole = Boolean(customOrgRole);
      const hasRequiredNewRolePermission = isAtLeastAsPrivileged(permission, rolePermission);
      if (!hasRequiredNewRolePermission)
        throw new BadRequestError({ message: "Failed to create a more privileged group" });
      if (isCustomRole) customRole = customOrgRole;
    }

    const [updatedGroup] = await groupDAL.update(
      {
        orgId: actorOrgId,
        slug: currentSlug
      },
      {
        name,
        slug: slug ? slugify(slug) : undefined,
        ...(role
          ? {
              role: customRole ? OrgMembershipRole.Custom : role,
              roleId: customRole?.id ?? null
            }
          : {})
      }
    );

    return updatedGroup;
  };

  const deleteGroup = async ({ groupSlug, actor, actorId, actorAuthMethod, actorOrgId }: TDeleteGroupDTO) => {
    if (!actorOrgId) throw new BadRequestError({ message: "Failed to create group without organization" });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.Groups);

    const plan = await licenseService.getPlan(actorOrgId);

    if (!plan.groups)
      throw new BadRequestError({
        message: "Failed to delete group due to plan restriction. Upgrade plan to delete group."
      });

    const [group] = await groupDAL.delete({
      orgId: actorOrgId,
      slug: groupSlug
    });

    return group;
  };

  const listGroupUsers = async ({ groupSlug, actor, actorId, actorAuthMethod, actorOrgId }: TListGroupUsersDTO) => {
    if (!actorOrgId) throw new BadRequestError({ message: "Failed to create group without organization" });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Groups);

    const group = await groupDAL.findOne({
      orgId: actorOrgId,
      slug: groupSlug
    });

    if (!group)
      throw new BadRequestError({
        message: `Failed to find group with slug ${groupSlug}`
      });

    const users = await groupDAL.findAllGroupMembers(group.orgId, group.id);
    return users;
  };

  const addUserToGroup = async ({
    groupSlug,
    username,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TAddUserToGroupDTO) => {
    if (!actorOrgId) throw new BadRequestError({ message: "Failed to create group without organization" });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Groups);

    // check if group with slug exists
    const group = await groupDAL.findOne({
      orgId: actorOrgId,
      slug: groupSlug
    });

    if (!group)
      throw new BadRequestError({
        message: `Failed to find group with slug ${groupSlug}`
      });

    const { permission: groupRolePermission } = await permissionService.getOrgPermissionByRole(group.role, actorOrgId);

    // check if user has broader or equal to privileges than group
    const hasRequiredPriviledges = isAtLeastAsPrivileged(permission, groupRolePermission);
    if (!hasRequiredPriviledges)
      throw new ForbiddenRequestError({ message: "Failed to add user to more privileged group" });

    // get user with username
    const user = await userDAL.findUserEncKeyByUsername({
      username
    });

    if (!user)
      throw new BadRequestError({
        message: `Failed to find user with username ${username}`
      });

    // check if user group membership already exists
    const existingUserGroupMembership = await userGroupMembershipDAL.findOne({
      groupId: group.id,
      userId: user.userId
    });

    if (existingUserGroupMembership)
      throw new BadRequestError({
        message: `User ${username} is already part of the group ${groupSlug}`
      });

    // check if user is even part of the organization
    const existingUserOrgMembership = await orgDAL.findMembership({
      userId: user.userId,
      orgId: actorOrgId
    });

    if (!existingUserOrgMembership)
      throw new BadRequestError({
        message: `User ${username} is not part of the organization`
      });

    await userGroupMembershipDAL.create({
      userId: user.userId,
      groupId: group.id
    });

    // check which projects the group is part of
    const projectIds = (
      await groupProjectDAL.find({
        groupId: group.id
      })
    ).map((gp) => gp.projectId);

    const keys = await projectKeyDAL.find({
      receiverId: user.userId,
      $in: {
        projectId: projectIds
      }
    });

    const keysSet = new Set(keys.map((k) => k.projectId));
    const projectsToAddKeyFor = projectIds.filter((p) => !keysSet.has(p));

    for await (const projectId of projectsToAddKeyFor) {
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

      const { ciphertext: encryptedKey, nonce } = encryptAsymmetric(plaintextProjectKey, user.publicKey, botPrivateKey);

      await projectKeyDAL.create({
        encryptedKey,
        nonce,
        senderId: ghostUser.id,
        receiverId: user.userId,
        projectId
      });
    }

    return user;
  };

  const removeUserFromGroup = async ({
    groupSlug,
    username,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TRemoveUserFromGroupDTO) => {
    if (!actorOrgId) throw new BadRequestError({ message: "Failed to create group without organization" });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Groups);

    // check if group with slug exists
    const group = await groupDAL.findOne({
      orgId: actorOrgId,
      slug: groupSlug
    });

    if (!group)
      throw new BadRequestError({
        message: `Failed to find group with slug ${groupSlug}`
      });

    const { permission: groupRolePermission } = await permissionService.getOrgPermissionByRole(group.role, actorOrgId);

    // check if user has broader or equal to privileges than group
    const hasRequiredPriviledges = isAtLeastAsPrivileged(permission, groupRolePermission);
    if (!hasRequiredPriviledges)
      throw new ForbiddenRequestError({ message: "Failed to delete user from more privileged group" });

    const user = await userDAL.findOne({
      username
    });

    if (!user)
      throw new BadRequestError({
        message: `Failed to find user with username ${username}`
      });

    // check if user group membership already exists
    const existingUserGroupMembership = await userGroupMembershipDAL.findOne({
      groupId: group.id,
      userId: user.id
    });

    if (!existingUserGroupMembership)
      throw new BadRequestError({
        message: `User ${username} is not part of the group ${groupSlug}`
      });

    const projectIds = (
      await groupProjectDAL.find({
        groupId: group.id
      })
    ).map((gp) => gp.projectId);

    const t = await userGroupMembershipDAL.filterProjectsByUserMembership(user.id, group.id, projectIds);

    const projectsToDeleteKeyFor = projectIds.filter((p) => !t.has(p));

    if (projectsToDeleteKeyFor.length) {
      await projectKeyDAL.delete({
        receiverId: user.id,
        $in: {
          projectId: projectsToDeleteKeyFor
        }
      });
    }

    await userGroupMembershipDAL.delete({
      groupId: group.id,
      userId: user.id
    });

    return user;
  };

  return {
    createGroup,
    updateGroup,
    deleteGroup,
    listGroupUsers,
    addUserToGroup,
    removeUserFromGroup
  };
};
