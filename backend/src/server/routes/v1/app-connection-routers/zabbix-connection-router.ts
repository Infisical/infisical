import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateZabbixConnectionSchema,
  SanitizedZabbixConnectionSchema,
  UpdateZabbixConnectionSchema
} from "@app/services/app-connection/zabbix";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerZabbixConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Zabbix,
    server,
    sanitizedResponseSchema: SanitizedZabbixConnectionSchema,
    createSchema: CreateZabbixConnectionSchema,
    updateSchema: UpdateZabbixConnectionSchema
  });

  // The following endpoints are for internal Infisical App use only and not part of the public API
  server.route({
    method: "GET",
    url: `/:connectionId/hosts`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listZabbixHosts",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z
          .object({
            hostId: z.string(),
            host: z.string()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;
      const hosts = await server.services.appConnection.zabbix.listHosts(connectionId, req.permission);
      return hosts;
    }
  });
};
