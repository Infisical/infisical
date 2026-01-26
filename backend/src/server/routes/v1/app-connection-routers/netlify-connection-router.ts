import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateNetlifyConnectionSchema,
  SanitizedNetlifyConnectionSchema,
  UpdateNetlifyConnectionSchema
} from "@app/services/app-connection/netlify";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerNetlifyConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Netlify,
    server,
    sanitizedResponseSchema: SanitizedNetlifyConnectionSchema,
    createSchema: CreateNetlifyConnectionSchema,
    updateSchema: UpdateNetlifyConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use
  server.route({
    method: "GET",
    url: `/:connectionId/accounts`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listNetlifyAccounts",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          accounts: z
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
      const { connectionId } = req.params;

      const accounts = await server.services.appConnection.netlify.listAccounts(connectionId, req.permission);

      return { accounts };
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/accounts/:accountId/sites`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listNetlifySites",
      params: z.object({
        connectionId: z.string().uuid(),
        accountId: z.string()
      }),
      response: {
        200: z.object({
          sites: z
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

      const sites = await server.services.appConnection.netlify.listSites(connectionId, req.permission, accountId);

      return { sites };
    }
  });
};
