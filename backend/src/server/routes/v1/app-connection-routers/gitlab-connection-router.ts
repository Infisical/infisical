import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateGitLabConnectionSchema,
  SanitizedGitLabConnectionSchema,
  TGitLabGroup,
  TGitLabProject,
  TGitLabServiceAccount,
  UpdateGitLabConnectionSchema
} from "@app/services/app-connection/gitlab";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerGitLabConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.GitLab,
    server,
    sanitizedResponseSchema: SanitizedGitLabConnectionSchema,
    createSchema: CreateGitLabConnectionSchema,
    updateSchema: UpdateGitLabConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use
  server.route({
    method: "GET",
    url: `/:connectionId/projects`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listGitLabProjects",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      querystring: z.object({
        search: z.string().trim().max(255).optional(),
        limit: z.coerce.number().int().min(1).max(100).optional()
      }),
      response: {
        200: z
          .object({
            id: z.string(),
            name: z.string()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const { connectionId } = req.params;
      const { search, limit } = req.query;

      const projects: TGitLabProject[] = await server.services.appConnection.gitlab.listProjects(
        connectionId,
        req.permission,
        search,
        limit
      );

      return projects;
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/groups`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listGitLabGroups",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      querystring: z.object({
        search: z.string().trim().max(255).optional(),
        limit: z.coerce.number().int().min(1).max(100).optional()
      }),
      response: {
        200: z
          .object({
            id: z.string(),
            name: z.string(),
            fullName: z.string(),
            fullPath: z.string()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const { connectionId } = req.params;
      const { search, limit } = req.query;

      const groups: TGitLabGroup[] = await server.services.appConnection.gitlab.listGroups(
        connectionId,
        req.permission,
        search,
        limit
      );

      return groups;
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/groups/:groupId/service-accounts`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listGitLabGroupServiceAccounts",
      params: z.object({
        connectionId: z.string().uuid(),
        groupId: z.string().trim().max(20).regex(/^\d+$/, "Group ID must be a numeric GitLab group ID")
      }),
      response: {
        200: z
          .object({
            id: z.string(),
            username: z.string(),
            name: z.string()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const { connectionId, groupId } = req.params;

      const serviceAccounts: TGitLabServiceAccount[] =
        await server.services.appConnection.gitlab.listGroupServiceAccounts(connectionId, groupId, req.permission);

      return serviceAccounts;
    }
  });
};
