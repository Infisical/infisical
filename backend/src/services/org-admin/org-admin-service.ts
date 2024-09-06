import { ForbiddenError } from "@casl/ability";

import { ProjectMembershipRole, ProjectVersion, SecretKeyEncoding } from "@app/db/schemas";
import { OrgPermissionAdminConsoleAction, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { infisicalSymmetricDecrypt } from "@app/lib/crypto/encryption";
import { BadRequestError } from "@app/lib/errors";

import { TProjectDALFactory } from "../project/project-dal";
import { assignWorkspaceKeysToMembers } from "../project/project-fns";
import { TProjectBotDALFactory } from "../project-bot/project-bot-dal";
import { TProjectKeyDALFactory } from "../project-key/project-key-dal";
import { TProjectMembershipDALFactory } from "../project-membership/project-membership-dal";
import { TProjectUserMembershipRoleDALFactory } from "../project-membership/project-user-membership-role-dal";
import { TUserDALFactory } from "../user/user-dal";
import { TAccessProjectDTO, TListOrgProjectsDTO } from "./org-admin-types";

type TOrgAdminServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  projectDAL: Pick<TProjectDALFactory, "find" | "findById" | "findProjectGhostUser">;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "findOne" | "create" | "transaction" | "delete">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "findLatestProjectKey" | "create">;
  projectBotDAL: Pick<TProjectBotDALFactory, "findOne">;
  userDAL: Pick<TUserDALFactory, "findUserEncKeyByUserId">;
  projectUserMembershipRoleDAL: Pick<TProjectUserMembershipRoleDALFactory, "create" | "delete">;
};

export type TOrgAdminServiceFactory = ReturnType<typeof orgAdminServiceFactory>;

export const orgAdminServiceFactory = ({
  permissionService,
  projectDAL,
  projectMembershipDAL,
  projectKeyDAL,
  projectBotDAL,
  userDAL,
  projectUserMembershipRoleDAL
}: TOrgAdminServiceFactoryDep) => {
  const listOrgProjects = async ({
    actor,
    limit,
    actorId,
    offset,
    search,
    actorOrgId,
    actorAuthMethod
  }: TListOrgProjectsDTO) => {
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionAdminConsoleAction.AccessAllProjects,
      OrgPermissionSubjects.AdminConsole
    );
    const projects = await projectDAL.find(
      {
        orgId: actorOrgId,
        $search: {
          name: search ? `%${search}%` : undefined
        }
      },
      { offset, limit, sort: [["name", "asc"]], count: true }
    );

    const count = projects?.[0]?.count ? parseInt(projects?.[0]?.count, 10) : 0;
    return { projects, count };
  };

  const grantProjectAdminAccess = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId
  }: TAccessProjectDTO) => {
    const { permission, membership } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionAdminConsoleAction.AccessAllProjects,
      OrgPermissionSubjects.AdminConsole
    );

    const project = await projectDAL.findById(projectId);
    if (!project) throw new BadRequestError({ message: "Project not found" });

    if (project.version === ProjectVersion.V1) {
      throw new BadRequestError({ message: "Please upgrade your project on your dashboard" });
    }

    // check already there exist a membership if there return it
    const projectMembership = await projectMembershipDAL.findOne({
      projectId,
      userId: actorId
    });
    if (projectMembership) {
      // reset and make the user admin
      await projectMembershipDAL.transaction(async (tx) => {
        await projectUserMembershipRoleDAL.delete({ projectMembershipId: projectMembership.id }, tx);
        await projectUserMembershipRoleDAL.create(
          {
            projectMembershipId: projectMembership.id,
            role: ProjectMembershipRole.Admin
          },
          tx
        );
      });
      return { isExistingMember: true, membership: projectMembership };
    }

    // missing membership thus add admin back as admin to project
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

    const userEncryptionKey = await userDAL.findUserEncKeyByUserId(actorId);
    if (!userEncryptionKey) throw new BadRequestError({ message: "user encryption key not found" });
    const [newWsMember] = assignWorkspaceKeysToMembers({
      decryptKey: ghostUserLatestKey,
      userPrivateKey: botPrivateKey,
      members: [
        {
          orgMembershipId: membership.id,
          userPublicKey: userEncryptionKey.publicKey
        }
      ]
    });

    const updatedMembership = await projectMembershipDAL.transaction(async (tx) => {
      const newProjectMembership = await projectMembershipDAL.create(
        {
          projectId,
          userId: actorId
        },
        tx
      );
      await projectUserMembershipRoleDAL.create(
        { projectMembershipId: newProjectMembership.id, role: ProjectMembershipRole.Admin },
        tx
      );

      await projectKeyDAL.create(
        {
          encryptedKey: newWsMember.workspaceEncryptedKey,
          nonce: newWsMember.workspaceEncryptedNonce,
          senderId: ghostUser.id,
          receiverId: actorId,
          projectId
        },
        tx
      );
      return newProjectMembership;
    });
    return { isExistingMember: false, membership: updatedMembership };
  };

  return { listOrgProjects, grantProjectAdminAccess };
};
