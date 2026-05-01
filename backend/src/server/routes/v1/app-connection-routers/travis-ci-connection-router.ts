import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateTravisCIConnectionSchema,
  SanitizedTravisCIConnectionSchema,
  UpdateTravisCIConnectionSchema
} from "@app/services/app-connection/travis-ci";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerTravisCIConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.TravisCI,
    server,
    sanitizedResponseSchema: SanitizedTravisCIConnectionSchema,
    createSchema: CreateTravisCIConnectionSchema,
    updateSchema: UpdateTravisCIConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use
  server.route({
    method: "GET",
    url: `/:connectionId/repositories`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listTravisCIRepositories",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z
          .object({
            id: z.string(),
            name: z.string(),
            slug: z.string()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const repositories = await server.services.appConnection.travisCI.listRepositories(connectionId, req.permission);

      return repositories;
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/branches`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listTravisCIBranches",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      querystring: z.object({
        repositoryId: z.string().min(1, "Repository ID is required")
      }),
      response: {
        200: z
          .object({
            name: z.string(),
            isDefault: z.boolean()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;
      const { repositoryId } = req.query;

      const branches = await server.services.appConnection.travisCI.listBranches(
        connectionId,
        repositoryId,
        req.permission
      );

      return branches;
    }
  });
};
