import { z } from "zod";

import { ApiKeysSchema } from "@app/db/schemas/api-keys";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerUserRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/me/api-keys",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getMyApiKeysV3",
      response: {
        200: z.object({
          apiKeyData: ApiKeysSchema.omit({ secretHash: true }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const apiKeyData = await server.services.apiKey.getMyApiKeys(req.permission.id);
      return { apiKeyData };
    }
  });
};
