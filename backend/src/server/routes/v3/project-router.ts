import { ForbiddenError } from "@casl/ability";
import crypto from "crypto";
import { z } from "zod";

import { ProjectMembershipRole, ProjectsSchema } from "@app/db/schemas";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { encryptAsymmetric } from "@app/lib/crypto";
import { BadRequestError } from "@app/lib/errors";
import { createWsMembers } from "@app/lib/project";
import { authRateLimit } from "@app/server/config/rateLimiter";
import { ActorType } from "@app/services/auth/auth-type";

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
        inviteMemberEmails: z.array(z.string().email()).optional(),
        organizationId: z.string().trim()
      }),
      response: {
        200: z.object({
          project: projectWithEnv
        })
      }
    },
    handler: async (req) => {
      const { permission } = await server.services.permission.getOrgPermission(
        req.permission.type,
        req.permission.id,
        req.body.organizationId
      );
      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Workspace);

      // 2. Create a new project (will set the e2ee db field to false).
      const { project, ghostUser } = await server.services.project.createProject({
        actorId: req.permission.id,
        actor: req.permission.type,
        orgId: req.body.organizationId,
        workspaceName: req.body.projectName
      });

      // 3. Create a random key that we'll use as the project key.
      const randomBytes = crypto.randomBytes(16).toString("hex");

      // 4. Encrypt the project key with the users key pair.
      const { ciphertext: encryptedProjectKey, nonce: encryptedProjectKeyIv } = encryptAsymmetric(
        randomBytes,
        ghostUser.keys.publicKey,
        ghostUser.keys.plainPrivateKey
      );

      // 4. Save the project key for the ghost user.
      await server.services.projectKey.uploadProjectKeys({
        projectId: project.id,
        actor: req.permission.type,
        actorId: ghostUser.user.id,
        nonce: encryptedProjectKeyIv,
        receiverId: ghostUser.user.id,
        encryptedKey: encryptedProjectKey
      });

      // 5. Create a bot for the project.
      const bot = await server.services.projectBot.findBotByProjectId({
        actorId: ghostUser.user.id,
        actor: req.permission.type,
        projectId: project.id,

        // We set the publicKey and privateKey of the bot to the same as the ghost user.
        // We do this because we'll need to access the private key again later, when adding new members to the project.
        publicKey: ghostUser.keys.publicKey,
        privateKey: ghostUser.keys.plainPrivateKey
      });

      // 6. Activate the bot.
      await server.services.projectBot.setBotActiveState({
        botKey: {
          encryptedKey: encryptedProjectKey,
          nonce: encryptedProjectKeyIv
        },
        actorId: ghostUser.user.id,
        isActive: true,
        actor: req.permission.type,
        botId: bot.id
      });

      // 7. get the current user & org membership
      const user = await server.services.user.getMe(req.permission.id);
      const userOrgMembership = await server.services.permission.getUserOrgPermission(user.id, req.body.organizationId);

      // 7. Get the latest key from the ghost!
      const latestKey = await server.services.projectKey.getLatestProjectKey({
        actorId: ghostUser.user.id,
        actor: req.permission.type,
        projectId: project.id
      });

      if (!latestKey) throw new Error("Failed to get latest key");

      // If the project is being created by a user, add the user to the project as an admin
      if (req.permission.type === ActorType.USER) {
        const projectAdmin = createWsMembers({
          decryptKey: latestKey,
          members: [
            {
              userPublicKey: user.publicKey,
              orgMembershipId: userOrgMembership.membership.id,
              projectMembershipRole: ProjectMembershipRole.Admin // <-- Make the first user an admin
            }
          ],
          userPrivateKey: ghostUser.keys.plainPrivateKey
        });

        await server.services.projectMembership.addUsersToProject({
          projectId: project.id,
          actorId: ghostUser.user.id,
          actor: req.permission.type,
          members: projectAdmin
        });
      }
      // If the project is being created by an identity, add the identity to the project as an admin
      else if (req.permission.type === ActorType.IDENTITY) {
        await server.services.identityProject.createProjectIdentity({
          actor: ActorType.IDENTITY,
          actorId: ghostUser.user.id,
          identityId: req.permission.id,
          projectId: project.id,
          role: ProjectMembershipRole.Admin
        });
      }

      return { project };
    }
  });

  server.route({
    method: "POST",
    url: "/:projectId/memberships",
    config: {
      rateLimit: authRateLimit
    },
    schema: {
      params: z.object({
        projectId: z.string()
      }),
      body: z.object({
        emails: z.string().email().array()
      })
    },
    handler: async (req) => {
      const { permission } = await server.services.permission.getProjectPermission(
        req.permission.type,
        req.permission.id,
        req.params.projectId
      );
      ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.Member);

      const project = await server.services.project.getAProject({
        actorId: req.permission.id,
        actor: req.permission.type,
        projectId: req.params.projectId
      });

      const ghostUser = await server.services.project.findProjectGhostUser(req.params.projectId);

      if (!ghostUser) {
        throw new BadRequestError({
          message: "Failed" // TODO: Add a message
        });
      }

      const latestKey = await server.services.projectKey.getLatestProjectKey({
        actorId: ghostUser.id,
        actor: ActorType.USER,
        projectId: req.params.projectId
      });

      if (!latestKey) {
        throw new BadRequestError({
          message: "Failed to find project key"
        });
      }

      const bot = await server.services.projectBot.findBotByProjectId({
        actor: req.permission.type,
        actorId: req.permission.id,
        projectId: req.params.projectId
      });

      // We get the bot private key, because the bot private key is the same as the ghost user's private key.
      const botPrivateKey = server.services.projectBot.getBotPrivateKey({ bot });

      const members = await server.services.org.findOrgMembersByEmail({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: project.orgId,
        emails: req.body.emails
      });

      if (members.length !== req.body.emails.length) {
        throw new BadRequestError({
          message: "Some users are not part of the organization"
        });
      }

      const wsMembers = createWsMembers({
        members: members.map((membership) => ({
          orgMembershipId: membership.id,
          projectMembershipRole: ProjectMembershipRole.Member,
          userPublicKey: membership.user.publicKey
        })),
        decryptKey: latestKey,
        userPrivateKey: botPrivateKey
      });

      await server.services.projectMembership.addUsersToProject({
        projectId: req.params.projectId,
        actorId: ghostUser.id, // We set the actor ID to the ghost user, because this is used as senderId in the project key sharing
        actor: ActorType.USER,
        members: wsMembers
      });

      return {};
    }
  });
};
