import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CoolifyResourceType,
  CreateCoolifyConnectionSchema,
  SanitizedCoolifyConnectionSchema,
  UpdateCoolifyConnectionSchema
} from "@app/services/app-connection/coolify";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerCoolifyConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Coolify,
    server,
    sanitizedResponseSchema: SanitizedCoolifyConnectionSchema,
    createSchema: CreateCoolifyConnectionSchema,
    updateSchema: UpdateCoolifyConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use
  server.route({
    method: "GET",
    url: `/:connectionId/resources`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listCoolifyResources",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          resources: z
            .object({
              id: z.string(),
              name: z.string(),
              type: z.nativeEnum(CoolifyResourceType),
              projectName: z.string(),
              environmentName: z.string()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const resources = await server.services.appConnection.coolify.listResources(connectionId, req.permission);

      return { resources };
    }
  });
};
