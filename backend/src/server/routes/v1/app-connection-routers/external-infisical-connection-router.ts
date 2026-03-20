import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateExternalInfisicalConnectionSchema,
  SanitizedExternalInfisicalConnectionSchema,
  UpdateExternalInfisicalConnectionSchema
} from "@app/services/app-connection/external-infisical";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

const RemoteProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  type: z.string(),
  environments: z.array(z.object({ id: z.string(), name: z.string(), slug: z.string() }))
});

const RemoteEnvironmentFolderTreeSchema = z.record(
  z.string(),
  z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    folders: z.array(z.object({ id: z.string(), name: z.string(), path: z.string() }))
  })
);

export const registerExternalInfisicalConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.ExternalInfisical,
    server,
    sanitizedResponseSchema: SanitizedExternalInfisicalConnectionSchema,
    createSchema: CreateExternalInfisicalConnectionSchema,
    updateSchema: UpdateExternalInfisicalConnectionSchema
  });

  server.route({
    method: "GET",
    url: `/:connectionId/projects`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listExternalInfisicalProjects",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          projects: RemoteProjectSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;
      const projects = await server.services.appConnection.externalInfisical.listProjects(connectionId, req.permission);
      return { projects };
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/projects/:projectId/environment-folder-tree`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getExternalInfisicalEnvironmentFolderTree",
      params: z.object({
        connectionId: z.string().uuid(),
        projectId: z.string().uuid()
      }),
      response: {
        200: RemoteEnvironmentFolderTreeSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId, projectId } = req.params;
      return server.services.appConnection.externalInfisical.getEnvironmentFolderTree(
        connectionId,
        projectId,
        req.permission
      );
    }
  });
};
