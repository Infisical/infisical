import { z } from "zod";

import { AuthMode } from "@app/lib/auth/actor-types";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateOpenAIConnectionSchema,
  SanitizedOpenAIConnectionSchema,
  UpdateOpenAIConnectionSchema
} from "@app/services/app-connection/openai";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerOpenAIConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.OpenAI,
    server,
    sanitizedResponseSchema: SanitizedOpenAIConnectionSchema,
    createSchema: CreateOpenAIConnectionSchema,
    updateSchema: UpdateOpenAIConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use

  server.route({
    method: "GET",
    url: `/:connectionId/projects`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listOpenAIConnectionProjects",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          projects: z.object({ id: z.string(), name: z.string() }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const projects = await server.services.appConnection.openai.listProjects(connectionId, req.permission);

      return { projects };
    }
  });
};
