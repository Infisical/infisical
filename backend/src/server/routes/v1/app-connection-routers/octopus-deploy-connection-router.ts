import { z } from "zod";

import { BadRequestError } from "@app/lib/errors";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateOctopusDeployConnectionSchema,
  SanitizedOctopusDeployConnectionSchema,
  UpdateOctopusDeployConnectionSchema
} from "@app/services/app-connection/octopus-deploy";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerOctopusDeployConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.OctopusDeploy,
    server,
    sanitizedResponseSchema: SanitizedOctopusDeployConnectionSchema,
    createSchema: CreateOctopusDeployConnectionSchema,
    updateSchema: UpdateOctopusDeployConnectionSchema
  });

  server.route({
    method: "GET",
    url: `/:connectionId/spaces`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            slug: z.string(),
            isDefault: z.boolean()
          })
        )
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const spaces = await server.services.appConnection.octopusDeploy.listSpaces(connectionId, req.permission);

      return spaces;
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/projects`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        connectionId: z.string().uuid()
      }),
      querystring: z.object({
        spaceId: z.string().min(1, "Space ID is required")
      }),
      response: {
        200: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            slug: z.string()
          })
        )
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;
      const { spaceId } = req.query;

      const projects = await server.services.appConnection.octopusDeploy.listProjects(
        connectionId,
        spaceId,
        req.permission
      );

      return projects;
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/scope-values`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        connectionId: z.string().uuid()
      }),
      querystring: z.object({
        spaceId: z.string().min(1, "Space ID is required"),
        projectId: z.string().min(1, "Project ID is required")
      }),
      response: {
        200: z.object({
          environments: z
            .object({
              id: z.string(),
              name: z.string()
            })
            .array(),
          roles: z
            .object({
              id: z.string(),
              name: z.string()
            })
            .array(),
          machines: z
            .object({
              id: z.string(),
              name: z.string()
            })
            .array(),
          processes: z
            .object({
              id: z.string(),
              name: z.string()
            })
            .array(),
          actions: z
            .object({
              id: z.string(),
              name: z.string()
            })
            .array(),
          channels: z
            .object({
              id: z.string(),
              name: z.string()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;
      const { spaceId, projectId } = req.query;

      const scopeValues = await server.services.appConnection.octopusDeploy.getScopeValues(
        connectionId,
        spaceId,
        projectId,
        req.permission
      );

      if (!scopeValues) {
        throw new BadRequestError({ message: "Unable to get Octopus Deploy scope values" });
      }

      return scopeValues;
    }
  });
};
