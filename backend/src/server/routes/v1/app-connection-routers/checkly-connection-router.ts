import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateChecklyConnectionSchema,
  SanitizedChecklyConnectionSchema,
  UpdateChecklyConnectionSchema
} from "@app/services/app-connection/checkly";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerChecklyConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Checkly,
    server,
    sanitizedResponseSchema: SanitizedChecklyConnectionSchema,
    createSchema: CreateChecklyConnectionSchema,
    updateSchema: UpdateChecklyConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use
  server.route({
    method: "GET",
    url: `/:connectionId/accounts`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listChecklyAccounts",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          accounts: z
            .object({
              name: z.string(),
              id: z.string(),
              runtimeId: z.string()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const accounts = await server.services.appConnection.checkly.listAccounts(connectionId, req.permission);

      return { accounts };
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/accounts/:accountId/groups`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listChecklyGroups",
      params: z.object({
        connectionId: z.string().uuid(),
        accountId: z.string()
      }),
      response: {
        200: z.object({
          groups: z
            .object({
              name: z.string(),
              id: z.string()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId, accountId } = req.params;

      const groups = await server.services.appConnection.checkly.listGroups(connectionId, accountId, req.permission);

      return { groups };
    }
  });
};
