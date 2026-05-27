import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateGitLabConnectionSchema,
  SanitizedGitLabConnectionSchema,
  TGitLabGroup,
  TGitLabProject,
  UpdateGitLabConnectionSchema
} from "@app/services/app-connection/gitlab";
import { TGitLabGroupTreeItem } from "@app/services/app-connection/gitlab/gitlab-connection-types";
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
        search: z.string().trim().max(255).optional()
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
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;
      const { search } = req.query;

      const projects: TGitLabProject[] = await server.services.appConnection.gitlab.listProjects(
        connectionId,
        req.permission,
        search
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
        search: z.string().trim().max(255).optional()
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
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;
      const { search } = req.query;

      const groups: TGitLabGroup[] = await server.services.appConnection.gitlab.listGroups(
        connectionId,
        req.permission,
        search
      );

      return groups;
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/groups/root`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listGitLabRootGroups",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z
          .object({
            id: z.string(),
            name: z.string(),
            fullPath: z.string()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;
      const groups: TGitLabGroupTreeItem[] = await server.services.appConnection.gitlab.listRootGroups(
        connectionId,
        req.permission
      );
      return groups;
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/groups/:groupId/subgroups`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listGitLabGroupSubgroups",
      params: z.object({
        connectionId: z.string().uuid(),
        groupId: z.string().min(1)
      }),
      response: {
        200: z
          .object({
            id: z.string(),
            name: z.string(),
            fullPath: z.string()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId, groupId } = req.params;
      const subgroups: TGitLabGroupTreeItem[] = await server.services.appConnection.gitlab.listSubgroups(
        connectionId,
        groupId,
        req.permission
      );
      return subgroups;
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/groups/:groupId/projects`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listGitLabGroupProjects",
      params: z.object({
        connectionId: z.string().uuid(),
        groupId: z.string().min(1)
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
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId, groupId } = req.params;
      const projects: TGitLabProject[] = await server.services.appConnection.gitlab.listGroupProjects(
        connectionId,
        groupId,
        req.permission
      );
      return projects;
    }
  });
};
