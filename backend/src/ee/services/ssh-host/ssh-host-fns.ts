import { Knex } from "knex";

import { ActionProjectType } from "@app/db/schemas/models";
import { BadRequestError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";

import { ProjectPermissionSshHostActions, ProjectPermissionSub } from "../permission/project-permission";
import { TCreateSshLoginMappingsDTO } from "./ssh-host-types";

/**
 * Create SSH login mappings for a given SSH host
 * or SSH host group.
 */
export const createSshLoginMappings = async ({
  sshHostId,
  sshHostGroupId,
  loginMappings,
  sshHostLoginUserDAL,
  sshHostLoginUserMappingDAL,
  groupDAL,
  userDAL,
  permissionService,
  projectId,
  actorAuthMethod,
  actorOrgId,
  tx: outerTx
}: TCreateSshLoginMappingsDTO) => {
  const processCreation = async (tx: Knex) => {
    // (dangtony98): room to optimize
    for await (const { loginUser, allowedPrincipals } of loginMappings) {
      const sshHostLoginUser = await sshHostLoginUserDAL.create(
        // (dangtony98): should either pass in sshHostId or sshHostGroupId but not both
        {
          sshHostId,
          sshHostGroupId,
          loginUser
        },
        tx
      );

      if (allowedPrincipals.usernames && allowedPrincipals.usernames.length > 0) {
        const users = await userDAL.find(
          {
            $in: {
              username: allowedPrincipals.usernames
            }
          },
          { tx }
        );

        const foundUsernames = new Set(users.map((u) => u.username));

        for (const uname of allowedPrincipals.usernames) {
          if (!foundUsernames.has(uname)) {
            throw new BadRequestError({
              message: `Invalid username: ${uname}`
            });
          }
        }

        for await (const user of users) {
          // check that each user has access to the SSH project
          await permissionService.getProjectPermission({
            actor: ActorType.USER,
            actorId: user.id,
            projectId,
            actorAuthMethod,
            actorOrgId,
            actionProjectType: ActionProjectType.SSH
          });
        }

        await sshHostLoginUserMappingDAL.insertMany(
          users.map((user) => ({
            sshHostLoginUserId: sshHostLoginUser.id,
            userId: user.id
          })),
          tx
        );
      }

      if (allowedPrincipals.groups && allowedPrincipals.groups.length > 0) {
        const projectGroups = await groupDAL.findGroupsByProjectId(projectId);
        const groups = projectGroups.filter((g) => allowedPrincipals.groups?.includes(g.slug));

        if (groups.length !== allowedPrincipals.groups?.length) {
          throw new BadRequestError({
            message: `Invalid group slugs: ${allowedPrincipals.groups
              .filter((g) => !projectGroups.some((pg) => pg.slug === g))
              .join(", ")}`
          });
        }

        for await (const group of groups) {
          // check that each group has access to the SSH project and have read access to hosts
          const hasPermission = await permissionService.checkGroupProjectPermission({
            groupId: group.id,
            projectId,
            checkPermissions: [ProjectPermissionSshHostActions.Read, ProjectPermissionSub.SshHosts]
          });
          if (!hasPermission) {
            throw new BadRequestError({
              message: `Group ${group.slug} does not have access to the SSH project`
            });
          }
        }

        await sshHostLoginUserMappingDAL.insertMany(
          groups.map((group) => ({
            sshHostLoginUserId: sshHostLoginUser.id,
            groupId: group.id
          })),
          tx
        );
      }
    }
  };

  if (outerTx) {
    return processCreation(outerTx);
  }

  return sshHostLoginUserDAL.transaction(processCreation);
};
