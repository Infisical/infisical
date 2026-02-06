import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateDigitalOceanConnectionSchema,
  SanitizedDigitalOceanConnectionSchema,
  UpdateDigitalOceanConnectionSchema
} from "@app/services/app-connection/digital-ocean";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerDigitalOceanConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.DigitalOcean,
    server,
    createSchema: CreateDigitalOceanConnectionSchema,
    updateSchema: UpdateDigitalOceanConnectionSchema,
    sanitizedResponseSchema: SanitizedDigitalOceanConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use
  server.route({
    method: "GET",
    url: `/:connectionId/apps`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listDigitalOceanApps",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          apps: z
            .object({
              id: z.string(),
              spec: z.object({
                name: z.string()
              })
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const apps = await server.services.appConnection.digitalOcean.listApps(connectionId, req.permission);

      return { apps };
    }
  });
};
