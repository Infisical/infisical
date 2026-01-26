import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateGitHubConnectionSchema,
  SanitizedGitHubConnectionSchema,
  UpdateGitHubConnectionSchema
} from "@app/services/app-connection/github";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerGitHubConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.GitHub,
    server,
    sanitizedResponseSchema: SanitizedGitHubConnectionSchema,
    createSchema: CreateGitHubConnectionSchema,
    updateSchema: UpdateGitHubConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use

  server.route({
    method: "GET",
    url: `/:connectionId/repositories`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listGitHubRepositories",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          repositories: z
            .object({ id: z.number(), name: z.string(), owner: z.object({ login: z.string(), id: z.number() }) })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const repositories = await server.services.appConnection.github.listRepositories(connectionId, req.permission);

      return { repositories };
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/organizations`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listGitHubOrganizations",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          organizations: z.object({ id: z.number(), login: z.string() }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const organizations = await server.services.appConnection.github.listOrganizations(connectionId, req.permission);

      return { organizations };
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/environments`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listGitHubEnvironments",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      querystring: z.object({
        repo: z.string().min(1, "Repository name is required"),
        owner: z.string().min(1, "Repository owner name is required")
      }),
      response: {
        200: z.object({
          environments: z.object({ id: z.number(), name: z.string() }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;
      const { repo, owner } = req.query;

      const environments = await server.services.appConnection.github.listEnvironments(
        {
          connectionId,
          repo,
          owner
        },
        req.permission
      );

      return { environments };
    }
  });
};
