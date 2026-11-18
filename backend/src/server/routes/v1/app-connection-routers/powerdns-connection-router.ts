import z from "zod";

import { AuthMode } from "@app/lib/auth/actor-types";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreatePowerDnsConnectionSchema,
  SanitizedPowerDnsConnectionSchema,
  UpdatePowerDnsConnectionSchema
} from "@app/services/app-connection/powerdns";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerPowerDnsConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.PowerDns,
    server,
    sanitizedResponseSchema: SanitizedPowerDnsConnectionSchema,
    createSchema: CreatePowerDnsConnectionSchema,
    updateSchema: UpdatePowerDnsConnectionSchema
  });

  server.route({
    method: "GET",
    url: `/:connectionId/zones`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listPowerDnsZones",
      params: z.object({
        connectionId: z.string().uuid().describe("The ID of the PowerDNS Connection to list zones from.")
      }),
      response: {
        200: z
          .object({
            id: z.string().describe("The PowerDNS zone ID."),
            name: z.string().describe("The name of the PowerDNS zone.")
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const { connectionId } = req.params;
      const zones = await server.services.appConnection.powerDns.listZones(connectionId, req.permission);
      return zones;
    }
  });
};
