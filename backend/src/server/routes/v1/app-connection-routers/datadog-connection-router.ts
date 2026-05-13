import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateDatadogConnectionSchema,
  SanitizedDatadogConnectionSchema,
  UpdateDatadogConnectionSchema
} from "@app/services/app-connection/datadog";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerDatadogConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Datadog,
    server,
    sanitizedResponseSchema: SanitizedDatadogConnectionSchema,
    createSchema: CreateDatadogConnectionSchema,
    updateSchema: UpdateDatadogConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use

  server.route({
    method: "GET",
    url: `/:connectionId/service-accounts`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listDatadogServiceAccounts",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          serviceAccounts: z.object({ id: z.string(), name: z.string() }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const {
        params: { connectionId }
      } = req;

      const serviceAccounts = await server.services.appConnection.datadog.listServiceAccounts(
        connectionId,
        req.permission
      );
      return { serviceAccounts };
    }
  });
};
