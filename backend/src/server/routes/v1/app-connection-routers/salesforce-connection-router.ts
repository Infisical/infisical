import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateSalesforceConnectionSchema,
  SanitizedSalesforceConnectionSchema,
  UpdateSalesforceConnectionSchema
} from "@app/services/app-connection/salesforce";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerSalesforceConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Salesforce,
    server,
    sanitizedResponseSchema: SanitizedSalesforceConnectionSchema,
    createSchema: CreateSalesforceConnectionSchema,
    updateSchema: UpdateSalesforceConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use

  server.route({
    method: "GET",
    url: `/:connectionId/oauth-apps`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listSalesforceOauthApps",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          apps: z.object({ identifier: z.string(), developerName: z.string() }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const apps = await server.services.appConnection.salesforce.listOauthApps(connectionId, req.permission);

      return { apps };
    }
  });
};
