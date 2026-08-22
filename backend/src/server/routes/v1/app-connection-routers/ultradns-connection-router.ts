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
      const zones = await server.services.appConnection.ultraDNS.listZones(connectionId, req.permission);
      return zones;
    }
  });
};
