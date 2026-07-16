import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateRundeckConnectionSchema,
  SanitizedRundeckConnectionSchema,
  UpdateRundeckConnectionSchema
} from "@app/services/app-connection/rundeck";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerRundeckConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Rundeck,
    server,
    sanitizedResponseSchema: SanitizedRundeckConnectionSchema,
    createSchema: CreateRundeckConnectionSchema,
    updateSchema: UpdateRundeckConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use
  server.route({
    method: "GET",
    url: `/:connectionId/projects`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listRundeckProjects",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          projects: z
            .object({
              name: z.string()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const projects = await server.services.appConnection.rundeck.listProjects(connectionId, req.permission);

      return { projects };
    }
  });
};
