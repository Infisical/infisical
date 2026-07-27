import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateSpaceliftConnectionSchema,
  SanitizedSpaceliftConnectionSchema,
  UpdateSpaceliftConnectionSchema
} from "@app/services/app-connection/spacelift";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerSpaceliftConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Spacelift,
    server,
    sanitizedResponseSchema: SanitizedSpaceliftConnectionSchema,
    createSchema: CreateSpaceliftConnectionSchema,
    updateSchema: UpdateSpaceliftConnectionSchema
  });

  server.route({
    method: "GET",
    url: `/:connectionId/contexts`,
    config: {
      rateLimit: readLimit
    },
    schema: {
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

      const contexts = await server.services.appConnection.spacelift.listContexts(connectionId, req.permission);

      return contexts;
    }
  });
};
