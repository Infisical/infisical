import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import {
  CreateAnthropicConnectionSchema,
  SanitizedAnthropicConnectionSchema,
  UpdateAnthropicConnectionSchema
} from "@app/services/app-connection/anthropic";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerAnthropicConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Anthropic,
    server,
    sanitizedResponseSchema: SanitizedAnthropicConnectionSchema,
    createSchema: CreateAnthropicConnectionSchema,
    updateSchema: UpdateAnthropicConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use

  server.route({
    method: "GET",
    url: `/:connectionId/models`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listAnthropicConnectionModels",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          models: z
            .object({
              id: z.string(),
              displayName: z.string(),
              family: z.string().nullable(),
              createdAt: z.string().nullable()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const models = await server.services.appConnection.anthropic.listModels(req.params.connectionId, req.permission);

      return { models };
    }
  });
};
