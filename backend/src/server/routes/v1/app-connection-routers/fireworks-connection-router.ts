import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateFireworksConnectionSchema,
  SanitizedFireworksConnectionSchema,
  UpdateFireworksConnectionSchema
} from "@app/services/app-connection/fireworks";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerFireworksConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Fireworks,
    server,
    sanitizedResponseSchema: SanitizedFireworksConnectionSchema,
    createSchema: CreateFireworksConnectionSchema,
    updateSchema: UpdateFireworksConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use
  server.route({
    method: "GET",
    url: `/:connectionId/service-accounts`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listFireworksServiceAccounts",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          serviceAccounts: z
            .object({
              name: z.string(),
              displayName: z.string(),
              email: z.string().optional(),
              role: z.string(),
              serviceAccount: z.boolean(),
              state: z.string()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const serviceAccounts = await server.services.appConnection.fireworks.listServiceAccounts(
        connectionId,
        req.permission
      );

      return { serviceAccounts };
    }
  });
};
