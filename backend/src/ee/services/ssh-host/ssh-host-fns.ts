import { Knex } from "knex";

import { ActionProjectType } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";

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

      if (allowedPrincipals.usernames.length > 0) {
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
          await permissionService.getUserProjectPermission({
            userId: user.id,
            projectId,
            authMethod: actorAuthMethod,
            userOrgId: actorOrgId,
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
    }
  };

  if (outerTx) {
    return processCreation(outerTx);
  }

  return sshHostLoginUserDAL.transaction(processCreation);
};
