import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateDNSMadeEasyConnectionSchema,
  SanitizedDNSMadeEasyConnectionSchema,
  UpdateDNSMadeEasyConnectionSchema
} from "@app/services/app-connection/dns-made-easy/dns-made-easy-connection-schema";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerDNSMadeEasyConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.DNSMadeEasy,
    server,
    sanitizedResponseSchema: SanitizedDNSMadeEasyConnectionSchema,
    createSchema: CreateDNSMadeEasyConnectionSchema,
    updateSchema: UpdateDNSMadeEasyConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use
  server.route({
    method: "GET",
    url: `/:connectionId/dns-made-easy-zones`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listDnsMadeEasyZones",
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
      const zones = await server.services.appConnection.dnsMadeEasy.listZones(connectionId, req.permission);
      return zones;
    }
  });
};
