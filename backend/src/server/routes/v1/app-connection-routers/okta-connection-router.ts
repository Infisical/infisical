import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateOktaConnectionSchema,
  SanitizedOktaConnectionSchema,
  UpdateOktaConnectionSchema
} from "@app/services/app-connection/okta";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerOktaConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Okta,
    server,
    sanitizedResponseSchema: SanitizedOktaConnectionSchema,
    createSchema: CreateOktaConnectionSchema,
    updateSchema: UpdateOktaConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use

  server.route({
    method: "GET",
    url: `/:connectionId/apps`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listOktaApps",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          apps: z.object({ id: z.string(), label: z.string() }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const {
        params: { connectionId }
      } = req;

      const apps = await server.services.appConnection.okta.listApps(connectionId, req.permission);
      return { apps };
    }
  });
};
