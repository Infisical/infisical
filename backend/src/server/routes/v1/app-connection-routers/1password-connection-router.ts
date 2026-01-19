import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import {
  CreateOnePassConnectionSchema,
  SanitizedOnePassConnectionSchema,
  UpdateOnePassConnectionSchema
} from "@app/services/app-connection/1password";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerOnePassConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.OnePass,
    server,
    sanitizedResponseSchema: SanitizedOnePassConnectionSchema,
    createSchema: CreateOnePassConnectionSchema,
    updateSchema: UpdateOnePassConnectionSchema
  });

  // The following endpoints are for internal Infisical App use only and not part of the public API
  server.route({
    method: "GET",
    url: `/:connectionId/vaults`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listOnePasswordVaults",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z
          .object({
            id: z.string(),
            name: z.string(),
            type: z.string(),
            items: z.number(),

            attributeVersion: z.number(),
            contentVersion: z.number(),

            // Corresponds to ISO8601 date string
            createdAt: z.string(),
            updatedAt: z.string()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;
      const vaults = await server.services.appConnection.onepass.listVaults(connectionId, req.permission);
      return vaults;
    }
  });
};
