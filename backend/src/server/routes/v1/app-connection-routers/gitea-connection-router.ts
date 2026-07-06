import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateGiteaConnectionSchema,
  SanitizedGiteaConnectionSchema,
  UpdateGiteaConnectionSchema
} from "@app/services/app-connection/gitea";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerGiteaConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Gitea,
    server,
    sanitizedResponseSchema: SanitizedGiteaConnectionSchema,
    createSchema: CreateGiteaConnectionSchema,
    updateSchema: UpdateGiteaConnectionSchema
  });

  // The following endpoints are for internal Infisical App use only and not part of the public API
  server.route({
    method: "GET",
    url: `/:connectionId/organizations`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listGiteaOrganizations",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          organizations: z.object({ id: z.string(), name: z.string(), fullName: z.string() }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const organizations = await server.services.appConnection.gitea.listOrganizations(connectionId, req.permission);

      return { organizations };
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/repositories`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listGiteaRepositories",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      querystring: z.object({
        search: z.string().trim().max(255).optional(),
        limit: z.coerce.number().int().min(1).max(100).optional()
      }),
      response: {
        200: z.object({
          repositories: z
            .object({
              id: z.string(),
              name: z.string(),
              owner: z.object({
                name: z.string()
              })
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;
      const { search, limit } = req.query;

      const repositories = await server.services.appConnection.gitea.listRepositories(
        connectionId,
        req.permission,
        search,
        limit
      );

      return { repositories };
    }
  });
};
