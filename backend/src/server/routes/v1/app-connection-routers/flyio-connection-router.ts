import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateFlyioConnectionSchema,
  SanitizedFlyioConnectionSchema,
  UpdateFlyioConnectionSchema
} from "@app/services/app-connection/flyio";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerFlyioConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Flyio,
    server,
    sanitizedResponseSchema: SanitizedFlyioConnectionSchema,
    createSchema: CreateFlyioConnectionSchema,
    updateSchema: UpdateFlyioConnectionSchema
  });

  // The following endpoints are for internal Infisical App use only and not part of the public API
  server.route({
    method: "GET",
    url: `/:connectionId/apps`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listFlyioApps",
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
      const apps = await server.services.appConnection.flyio.listApps(connectionId, req.permission);
      return apps;
    }
  });
};
