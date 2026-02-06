import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateHerokuConnectionSchema,
  SanitizedHerokuConnectionSchema,
  THerokuApp,
  UpdateHerokuConnectionSchema
} from "@app/services/app-connection/heroku";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerHerokuConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Heroku,
    server,
    sanitizedResponseSchema: SanitizedHerokuConnectionSchema,
    createSchema: CreateHerokuConnectionSchema,
    updateSchema: UpdateHerokuConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use
  server.route({
    method: "GET",
    url: `/:connectionId/apps`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listHerokuApps",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z
          .object({
            id: z.string(),
            name: z.string()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const apps: THerokuApp[] = await server.services.appConnection.heroku.listApps(connectionId, req.permission);

      return apps;
    }
  });
};
