import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateLiteLLMConnectionSchema,
  SanitizedLiteLLMConnectionSchema,
  UpdateLiteLLMConnectionSchema
} from "@app/services/app-connection/litellm";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

const LiteLLMListItemSchema = z.object({ id: z.string(), name: z.string() });

export const registerLiteLLMConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.LiteLLM,
    server,
    sanitizedResponseSchema: SanitizedLiteLLMConnectionSchema,
    createSchema: CreateLiteLLMConnectionSchema,
    updateSchema: UpdateLiteLLMConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use

  server.route({
    method: "GET",
    url: "/:connectionId/users",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listLiteLLMUsers",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      querystring: z.object({
        search: z.string().trim().optional()
      }),
      response: {
        200: z.object({
          users: LiteLLMListItemSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const {
        params: { connectionId },
        query: { search }
      } = req;

      const users = await server.services.appConnection.litellm.listUsers(connectionId, req.permission, search);
      return { users };
    }
  });

  server.route({
    method: "GET",
    url: "/:connectionId/teams",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listLiteLLMTeams",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      querystring: z.object({
        search: z.string().trim().optional()
      }),
      response: {
        200: z.object({
          teams: LiteLLMListItemSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const {
        params: { connectionId },
        query: { search }
      } = req;

      const teams = await server.services.appConnection.litellm.listTeams(connectionId, req.permission, search);
      return { teams };
    }
  });

  server.route({
    method: "GET",
    url: "/:connectionId/models",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listLiteLLMModels",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          models: LiteLLMListItemSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const {
        params: { connectionId }
      } = req;

      const models = await server.services.appConnection.litellm.listModels(connectionId, req.permission);
      return { models };
    }
  });
};
