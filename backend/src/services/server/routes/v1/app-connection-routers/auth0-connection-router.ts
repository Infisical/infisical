import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateAuth0ConnectionSchema,
  SanitizedAuth0ConnectionSchema,
  UpdateAuth0ConnectionSchema
} from "@app/services/app-connection/auth0";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerAuth0ConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Auth0,
    server,
    sanitizedResponseSchema: SanitizedAuth0ConnectionSchema,
    createSchema: CreateAuth0ConnectionSchema,
    updateSchema: UpdateAuth0ConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use

  server.route({
    method: "GET",
    url: `/:connectionId/clients`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listAuth0Clients",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          clients: z.object({ name: z.string(), id: z.string() }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const clients = await server.services.appConnection.auth0.listClients(connectionId, req.permission);

      return { clients };
    }
  });
};
