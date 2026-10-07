import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateUltraDNSConnectionSchema,
  SanitizedUltraDNSConnectionSchema,
  UpdateUltraDNSConnectionSchema
} from "@app/services/app-connection/ultradns/ultradns-connection-schema";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerUltraDNSConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.UltraDNS,
    server,
    sanitizedResponseSchema: SanitizedUltraDNSConnectionSchema,
    createSchema: CreateUltraDNSConnectionSchema,
    updateSchema: UpdateUltraDNSConnectionSchema
  });

  server.route({
    method: "GET",
    url: `/:connectionId/ultradns-zones`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listUltraDnsZones",
      params: z.object({
        connectionId: z.string().uuid().describe("The ID of the UltraDNS Connection to list zones from.")
      }),
      response: {
        200: z
          .object({
            id: z.string().describe("The fully qualified name of the UltraDNS zone, used as its ID."),
            name: z.string().describe("The fully qualified name of the UltraDNS zone.")
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const { connectionId } = req.params;
      const zones = await server.services.appConnection.ultraDNS.listZones(connectionId, req.permission);
      return zones;
    }
  });
};
