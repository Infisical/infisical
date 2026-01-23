import { z } from "zod";

import { UserActionsSchema } from "@app/db/schemas/user-actions";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerUserActionRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "createUserAction",
      body: z.object({
        action: z.string().trim()
      }),
      response: {
        200: z.object({
          message: z.string(),
          userAction: UserActionsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const userAction = await server.services.user.createUserAction(req.permission.id, req.body.action);
      return { userAction, message: "Successfully recorded user action" };
    }
  });

  server.route({
    url: "/",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getUserAction",
      querystring: z.object({
        action: z.string().trim()
      }),
      response: {
        200: z.object({
          userAction: UserActionsSchema.optional().nullable()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const userAction = await server.services.user.getUserAction(req.permission.id, req.query.action);
      return { userAction };
    }
  });
};
