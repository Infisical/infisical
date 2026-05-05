import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateGiteaConnectionSchema,
  SanitizedGiteaConnectionSchema,
  UpdateGiteaConnectionSchema
} from "@app/services/app-connection/gitea";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerGiteaConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Gitea,
    server,
    sanitizedResponseSchema: SanitizedGiteaConnectionSchema,
    createSchema: CreateGiteaConnectionSchema,
    updateSchema: UpdateGiteaConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use
  server.route({
    method: "GET",
    url: `/:connectionId/repositories`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listGiteaRepositories",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z
          .object({
            id: z.number(),
            name: z.string(),
            full_name: z.string(),
            owner: z.object({ login: z.string() })
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const repositories = await server.services.appConnection.gitea.listRepositories(connectionId, req.permission);

      return repositories;
    }
  });
};
