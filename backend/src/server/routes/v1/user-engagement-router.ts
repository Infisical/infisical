import { z } from "zod";

import { userEngagementLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerUserEngagementRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/me/wish",
    config: {
      rateLimit: userEngagementLimit
    },
    schema: {
      operationId: "createUserWish",
      body: z.object({
        text: z.string().min(1)
      }),
      response: {
        200: z.object({})
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      return server.services.userEngagement.createUserWish(req.permission.id, req.permission.orgId, req.body.text);
    }
  });
};
