import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateNorthflankConnectionSchema,
  SanitizedNorthflankConnectionSchema,
  UpdateNorthflankConnectionSchema
} from "@app/services/app-connection/northflank";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerNorthflankConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Northflank,
    server,
    sanitizedResponseSchema: SanitizedNorthflankConnectionSchema,
    createSchema: CreateNorthflankConnectionSchema,
    updateSchema: UpdateNorthflankConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use
  server.route({
    method: "GET",
    url: `/:connectionId/projects`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listNorthflankProjects",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          projects: z
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
      const projects = await server.services.appConnection.northflank.listProjects(connectionId, req.permission);
      return { projects };
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/projects/:projectId/secret-groups`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listNorthflankSecretGroups",
      params: z.object({
        connectionId: z.string().uuid(),
        projectId: z.string()
      }),
      response: {
        200: z.object({
          secretGroups: z
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
      const { connectionId, projectId } = req.params;
      const secretGroups = await server.services.appConnection.northflank.listSecretGroups(
        connectionId,
        projectId,
        req.permission
      );
      return { secretGroups };
    }
  });
};
