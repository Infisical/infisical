import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateTriggerDevConnectionSchema,
  SanitizedTriggerDevConnectionSchema,
  UpdateTriggerDevConnectionSchema
} from "@app/services/app-connection/trigger-dev";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerTriggerDevConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.TriggerDev,
    server,
    sanitizedResponseSchema: SanitizedTriggerDevConnectionSchema,
    createSchema: CreateTriggerDevConnectionSchema,
    updateSchema: UpdateTriggerDevConnectionSchema
  });

  // The following endpoints are for internal Infisical App use only and not part of the public API
  server.route({
    method: "GET",
    url: `/:connectionId/projects`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listTriggerDevProjects",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z
          .object({
            id: z.string(),
            name: z.string(),
            organization: z.object({
              id: z.string(),
              name: z.string(),
              slug: z.string()
            })
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;
      const projects = await server.services.appConnection.triggerDev.listProjects(connectionId, req.permission);
      return projects;
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/environments`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listTriggerDevEnvironments",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      querystring: z.object({
        projectRef: z.string().trim().min(1)
      }),
      response: {
        200: z
          .object({
            id: z.string(),
            slug: z.string(),
            type: z.string()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;
      const { projectRef } = req.query;
      const environments = await server.services.appConnection.triggerDev.listEnvironments(
        connectionId,
        projectRef,
        req.permission
      );
      return environments;
    }
  });
};
