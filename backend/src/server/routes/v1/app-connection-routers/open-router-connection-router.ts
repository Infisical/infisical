import { z } from "zod";

import { AuthMode } from "@app/lib/auth/actor-types";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateOpenRouterConnectionSchema,
  SanitizedOpenRouterConnectionSchema,
  UpdateOpenRouterConnectionSchema
} from "@app/services/app-connection/open-router";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerOpenRouterConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.OpenRouter,
    server,
    sanitizedResponseSchema: SanitizedOpenRouterConnectionSchema,
    createSchema: CreateOpenRouterConnectionSchema,
    updateSchema: UpdateOpenRouterConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use

  server.route({
    method: "GET",
    url: `/:connectionId/workspaces`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listOpenRouterConnectionWorkspaces",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          workspaces: z.object({ id: z.string(), name: z.string(), slug: z.string() }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const workspaces = await server.services.appConnection.openRouter.listWorkspaces(connectionId, req.permission);

      return { workspaces };
    }
  });
};
