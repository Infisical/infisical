import { z } from "zod";

import { ApiKeysSchema } from "@app/db/schemas/api-keys";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerUserRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/me/api-keys",
    schema: {
      response: {
        200: z.object({
          apiKeyData: ApiKeysSchema.omit({ secretHash: true }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const apiKeyData = await server.services.apiKey.getMyApiKeys(req.auth.userId);
      return { apiKeyData };
    }
  });
};
