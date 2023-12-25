import { z } from "zod";

import { ProjectBotsSchema } from "@app/db/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerProjectBotRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/:projectId",
    method: "GET",
    schema: {
      params: z.object({
        workspaceId: z.string().trim()
      }),
      response: {
        200: z.object({
          bot: ProjectBotsSchema.pick({
            name: true,
            projectId: true,
            isActive: true,
            publicKey: true,
            createdAt: true,
            updatedAt: true
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const bot = await server.services.projectBot.findBotByProjectId({
        actor: req.permission.type,
        actorId: req.permission.id,
        projectId: req.params.workspaceId
      });
      return { bot };
    }
  });

  server.route({
    url: "/:botId/active",
    method: "PATCH",
    schema: {
      body: z.object({
        isActive: z.boolean(),
        botKey: z
          .object({
            nonce: z.string().trim().optional(),
            encryptedKey: z.string().trim().optional()
          })
          .optional()
      }),
      params: z.object({
        botId: z.string().trim()
      }),
      response: {
        200: z.object({
          bot: ProjectBotsSchema.pick({
            name: true,
            projectId: true,
            isActive: true,
            publicKey: true,
            createdAt: true,
            updatedAt: true
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const bot = await server.services.projectBot.setBotActiveState({
        actor: req.permission.type,
        actorId: req.permission.id,
        botId: req.params.botId,
        botKey: req.body.botKey,
        isActive: req.body.isActive
      });
      return { bot };
    }
  });
};
