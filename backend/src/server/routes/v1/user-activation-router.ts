import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerUserActivationRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/secrets",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getSecretsActivationStatus",
      response: {
        200: z.object({
          userId: z.string(),
          orgId: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      return server.services.userActivation.getSecretsActivationStatus(req.permission.id, req.permission.orgId);
    }
  });
};
