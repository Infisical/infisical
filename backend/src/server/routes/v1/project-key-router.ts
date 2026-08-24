import { z } from "zod";

import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerProjectKeyRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/:workspaceId/key",
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "uploadProjectKey",
      params: z.object({
        workspaceId: z.string().trim()
      }),
      body: z.object({
        key: z.object({
          encryptedKey: z.string().trim(),
          nonce: z.string().trim(),
          userId: z.string().trim()
        })
      }),
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      await server.services.projectKey.uploadProjectKeys({
        projectId: req.params.workspaceId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        nonce: req.body.key.nonce,
        receiverId: req.body.key.userId,
        encryptedKey: req.body.key.encryptedKey
      });
      return { message: "Successfully uploaded key to workspace" };
    }
  });
};
