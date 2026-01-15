import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateAzureClientSecretsConnectionSchema,
  SanitizedAzureClientSecretsConnectionSchema,
  UpdateAzureClientSecretsConnectionSchema
} from "@app/services/app-connection/azure-client-secrets";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerAzureClientSecretsConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.AzureClientSecrets,
    server,
    sanitizedResponseSchema: SanitizedAzureClientSecretsConnectionSchema,
    createSchema: CreateAzureClientSecretsConnectionSchema,
    updateSchema: UpdateAzureClientSecretsConnectionSchema
  });

  server.route({
    method: "GET",
    url: `/:connectionId/clients`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listAzureClientSecretsClients",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          clients: z.object({ name: z.string(), id: z.string(), appId: z.string() }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const clients = await server.services.appConnection.azureClientSecrets.listApps(connectionId, req.permission);

      return { clients };
    }
  });
};
