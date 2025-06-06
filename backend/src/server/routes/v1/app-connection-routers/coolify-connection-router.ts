import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateCoolifyConnectionSchema,
  SanitizedCoolifyConnectionSchema,
  UpdateCoolifyConnectionSchema
} from "@app/services/app-connection/coolify";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerCoolifyConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Coolify,
    server,
    sanitizedResponseSchema: SanitizedCoolifyConnectionSchema,
    createSchema: CreateCoolifyConnectionSchema,
    updateSchema: UpdateCoolifyConnectionSchema
  });

  server.route({
    method: "GET",
    url: "/:connectionId/projects",
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
            uuid: z.string(),
            name: z.string()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;
      const projects = await server.services.appConnection.coolify.listProjects(connectionId, req.permission);
      return projects;
    }
  });

  server.route({
    method: "GET",
    url: "/:connectionId/projects/:projectId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        connectionId: z.string().uuid(),
        projectId: z.string().cuid2()
      }),
      response: {
        200: z
          .object({
            id: z.number(),
            uuid: z.string(),
            name: z.string()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId, projectId } = req.params;
      const applications = await server.services.appConnection.coolify.listProjectEnvironments(
        connectionId,
        projectId,
        req.permission
      );
      return applications;
    }
  });

  server.route({
    method: "GET",
    url: "/:connectionId/environments/:envId/applications",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        connectionId: z.string().uuid(),
        envId: z.coerce.number()
      }),
      response: {
        200: z
          .object({
            uuid: z.string(),
            name: z.string(),
            created_at: z.string(),
            updated_at: z.string()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId, envId } = req.params;
      const applications = await server.services.appConnection.coolify.listApplications(
        connectionId,
        envId,
        req.permission
      );
      return applications;
    }
  });
};
