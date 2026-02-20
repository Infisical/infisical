import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateAzureDnsConnectionSchema,
  SanitizedAzureDnsConnectionSchema,
  UpdateAzureDnsConnectionSchema
} from "@app/services/app-connection/azure-dns/azure-dns-connection-schema";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerAzureDnsConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.AzureDNS,
    server,
    sanitizedResponseSchema: SanitizedAzureDnsConnectionSchema,
    createSchema: CreateAzureDnsConnectionSchema,
    updateSchema: UpdateAzureDnsConnectionSchema
  });

  server.route({
    method: "GET",
    url: `/:connectionId/azure-dns-zones`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listAzureDnsZones",
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
      const zones = await server.services.appConnection.azureDns.listZones(connectionId, req.permission);
      return zones;
    }
  });
};
