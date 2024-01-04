import { z } from "zod";

import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerSecretRotationProviderRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/:workspaceId",
    method: "GET",
    schema: {
      params: z.object({
        workspaceId: z.string().trim()
      }),
      response: {
        200: z.object({
          providers: z
            .object({
              name: z.string(),
              title: z.string(),
              image: z.string().optional(),
              description: z.string().optional(),
              template: z.any()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const providers = await server.services.secretRotation.getProviderTemplates({
        actor: req.permission.type,
        actorId: req.permission.id,
        projectId: req.params.workspaceId
      });
      return providers;
    }
  });
};
