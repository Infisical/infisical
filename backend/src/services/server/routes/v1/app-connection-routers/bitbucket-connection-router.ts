import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateBitbucketConnectionSchema,
  SanitizedBitbucketConnectionSchema,
  UpdateBitbucketConnectionSchema
} from "@app/services/app-connection/bitbucket";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerBitbucketConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Bitbucket,
    server,
    sanitizedResponseSchema: SanitizedBitbucketConnectionSchema,
    createSchema: CreateBitbucketConnectionSchema,
    updateSchema: UpdateBitbucketConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use

  server.route({
    method: "GET",
    url: `/:connectionId/workspaces`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listBitbucketWorkspaces",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          workspaces: z.object({ slug: z.string() }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const {
        params: { connectionId }
      } = req;

      const workspaces = await server.services.appConnection.bitbucket.listWorkspaces(connectionId, req.permission);

      return { workspaces };
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/repositories`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listBitbucketRepositories",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      querystring: z.object({
        workspaceSlug: z.string().min(1).max(255)
      }),
      response: {
        200: z.object({
          repositories: z.object({ slug: z.string(), full_name: z.string(), uuid: z.string() }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const {
        params: { connectionId },
        query: { workspaceSlug }
      } = req;

      const repositories = await server.services.appConnection.bitbucket.listRepositories(
        { connectionId, workspaceSlug },
        req.permission
      );

      return { repositories };
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/environments`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listBitbucketEnvironments",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      querystring: z.object({
        workspaceSlug: z.string().min(1).max(255),
        repositorySlug: z.string().min(1).max(255)
      }),
      response: {
        200: z.object({
          environments: z.object({ slug: z.string(), name: z.string(), uuid: z.string() }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const {
        params: { connectionId },
        query: { workspaceSlug, repositorySlug }
      } = req;

      const environments = await server.services.appConnection.bitbucket.listEnvironments(
        { connectionId, workspaceSlug, repositorySlug },
        req.permission
      );

      return { environments };
    }
  });
};
