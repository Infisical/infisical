import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateStripeConnectionSchema,
  SanitizedStripeConnectionSchema,
  UpdateStripeConnectionSchema
} from "@app/services/app-connection/stripe";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerStripeConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Stripe,
    server,
    sanitizedResponseSchema: SanitizedStripeConnectionSchema,
    createSchema: CreateStripeConnectionSchema,
    updateSchema: UpdateStripeConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use
  server.route({
    method: "GET",
    url: `/:connectionId/api-keys`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listStripeApiKeys",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          apiKeys: z
            .object({
              id: z.string(),
              name: z.string(),
              status: z.string(),
              permissions: z.string().array(),
              connectPermissions: z.string().array()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const apiKeys = await server.services.appConnection.stripe.listApiKeys(connectionId, req.permission);

      return { apiKeys };
    }
  });
};
