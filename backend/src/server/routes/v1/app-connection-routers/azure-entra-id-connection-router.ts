import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateAzureEntraIdConnectionSchema,
  SanitizedAzureEntraIdConnectionSchema,
  UpdateAzureEntraIdConnectionSchema
} from "@app/services/app-connection/azure-entra-id";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerAzureEntraIdConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.AzureEntraId,
    server,
    sanitizedResponseSchema: SanitizedAzureEntraIdConnectionSchema,
    createSchema: CreateAzureEntraIdConnectionSchema,
    updateSchema: UpdateAzureEntraIdConnectionSchema
  });

  server.route({
    method: "GET",
    url: `/:connectionId/scim-service-principals`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listAzureEntraIdScimServicePrincipals",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      querystring: z.object({
        search: z.string().trim().optional()
      }),
      response: {
        200: z.object({
          servicePrincipals: z.object({ id: z.string(), displayName: z.string(), appId: z.string() }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;
      const { search } = req.query;

      const servicePrincipals = await server.services.appConnection.azureEntraId.listScimServicePrincipals(
        connectionId,
        req.permission,
        search
      );

      return { servicePrincipals };
    }
  });
};
