import crypto from "crypto";
import { z } from "zod";

import { ProjectMembershipRole, ProjectsSchema } from "@app/db/schemas";
import { encryptAsymmetric } from "@app/lib/crypto";
import { createWsMembers } from "@app/lib/project";
import { authRateLimit } from "@app/server/config/rateLimiter";

const projectWithEnv = ProjectsSchema.merge(
  z.object({
    _id: z.string(),
    environments: z.object({ name: z.string(), slug: z.string(), id: z.string() }).array()
  })
);

export const registerProjectRouter = async (server: FastifyZodProvider) => {
  /* Create new project */
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: authRateLimit
    },
    schema: {
      body: z.object({
        projectName: z.string().trim(),
        inviteAllOrgMembers: z.boolean(),
        organizationId: z.string().trim()
      }),
      response: {
        200: z.object({
          workspace: projectWithEnv
        })
      }
    },
    handler: async (req) => {
      // 1. create the ghost user and add it to the org as admin
      const ghost = await server.services.org.addGhostUser(req.body.organizationId);

      // 2. create the workspace
      const workspace = await server.services.project.createProject({
        actorId: ghost.user.id,
        actor: req.permission.type,
        orgId: req.body.organizationId,
        workspaceName: req.body.projectName
      });

      // 3. create a random key that we'll use as the project key
      const randomBytes = crypto.randomBytes(16).toString("hex");

      const ghostPrivateKey = ghost.keys.plainPrivateKey;

      const { ciphertext: encryptedProjectKey, nonce: encryptedProjectKeyIv } = encryptAsymmetric(
        randomBytes,
        ghost.keys.publicKey,
        ghostPrivateKey
      );

      // 3. create workspace keys for the ghost user
      await server.services.projectKey.uploadProjectKeys({
        projectId: workspace.id,
        actor: req.permission.type,
        actorId: ghost.user.id,
        nonce: encryptedProjectKeyIv,
        receiverId: ghost.user.id,
        encryptedKey: encryptedProjectKey
      });

      // 4. create a project bot
      const bot = await server.services.projectBot.findBotByProjectId({
        actorId: ghost.user.id,
        actor: req.permission.type,
        projectId: workspace.id
      });

      // 5. activate the bot
      await server.services.projectBot.setBotActiveState({
        botKey: {
          encryptedKey: encryptedProjectKey,
          nonce: encryptedProjectKeyIv
        },
        actorId: ghost.user.id,
        isActive: true,
        actor: req.permission.type,
        botId: bot.id
      });

      // 6. get the current user & org membership
      const user = await server.services.user.getMe(req.permission.id);
      const userOrgMembership = await server.services.permission.getUserOrgPermission(user.id, req.body.organizationId);

      // 7. Get the latest key from the ghost!
      const latestKey = await server.services.projectKey.getLatestProjectKey({
        actorId: ghost.user.id,
        actor: req.permission.type,
        projectId: workspace.id
      });

      if (!latestKey) throw new Error("Failed to get latest key");

      // 8. Create workspace members for the current user

      const projectAdmin = await createWsMembers({
        decryptKey: latestKey,
        members: [
          {
            userPublicKey: user.publicKey,
            orgMembershipId: userOrgMembership.membership.id,
            projectMembershipRole: ProjectMembershipRole.Admin // <-- Make the first user an admin
          }
        ],
        userPrivateKey: ghostPrivateKey
      });

      // 9. Add the current user to the workspace
      await server.services.projectMembership.addUsersToProject({
        projectId: workspace.id,
        actorId: ghost.user.id,
        actor: req.permission.type,
        members: projectAdmin
      });

      return { workspace };
    }
  });
};
