import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateGcpConnectionSchema,
  SanitizedGcpConnectionSchema,
  UpdateGcpConnectionSchema
} from "@app/services/app-connection/gcp";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerGcpConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.GCP,
    server,
    sanitizedResponseSchema: SanitizedGcpConnectionSchema,
    createSchema: CreateGcpConnectionSchema,
    updateSchema: UpdateGcpConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use
  server.route({
    method: "GET",
    url: `/:connectionId/secret-manager-projects`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listGcpSecretManagerProjects",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({ id: z.string(), name: z.string() }).array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const projects = await server.services.appConnection.gcp.listSecretManagerProjects(connectionId, req.permission);

      return projects;
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/secret-manager-project-locations`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listGcpSecretManagerProjectLocations",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      querystring: z.object({
        projectId: z.string()
      }),
      response: {
        200: z.object({ displayName: z.string(), locationId: z.string() }).array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const {
        params: { connectionId },
        query: { projectId }
      } = req;

      const locations = await server.services.appConnection.gcp.listSecretManagerProjectLocations(
        { connectionId, projectId },
        req.permission
      );

      return locations;
    }
  });
};
