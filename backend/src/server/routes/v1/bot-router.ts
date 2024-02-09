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
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          bot: ProjectBotsSchema.omit({
            iv: true,
            encryptedPrivateKey: true,
            tag: true,
            algorithm: true,
            keyEncoding: true
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const bot = await server.services.projectBot.findBotByProjectId({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId
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
          bot: ProjectBotsSchema.omit({
            iv: true,
            encryptedPrivateKey: true,
            tag: true,
            algorithm: true,
            keyEncoding: true
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const bot = await server.services.projectBot.setBotActiveState({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        botId: req.params.botId,
        botKey: req.body.botKey,
        isActive: req.body.isActive
      });
      return { bot };
    }
  });
};
