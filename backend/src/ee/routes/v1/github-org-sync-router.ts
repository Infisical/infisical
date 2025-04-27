import { z } from "zod";

import { GithubOrgSyncConfigsSchema } from "@app/db/schemas";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const SanitiziedGithubOrgSyncSchema = GithubOrgSyncConfigsSchema.pick({
  isActive: true,
  id: true,
  createdAt: true,
  updatedAt: true,
  orgId: true,
  githubOrgName: true
});

export const registerGithubOrgSyncRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      body: z.object({
        githubOrgName: z.string().trim(),
        githubOrgAccessToken: z.string().trim().max(1000).optional(),
        isActive: z.boolean().default(false)
      }),
      response: {
        200: z.object({
          githubOrgSyncConfig: SanitiziedGithubOrgSyncSchema
        })
      }
    },
    handler: async (req) => {
      const githubOrgSyncConfig = await server.services.githubOrgSync.createGithubOrgSync({
        orgPermission: req.permission,
        githubOrgName: req.body.githubOrgName,
        githubOrgAccessToken: req.body.githubOrgAccessToken,
        isActive: req.body.isActive
      });

      return { githubOrgSyncConfig };
    }
  });

  server.route({
    url: "/",
    method: "PATCH",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      body: z
        .object({
          githubOrgName: z.string().trim(),
          githubOrgAccessToken: z.string().trim().max(1000),
          isActive: z.boolean().default(false)
        })
        .partial(),
      response: {
        200: z.object({
          githubOrgSyncConfig: SanitiziedGithubOrgSyncSchema
        })
      }
    },
    handler: async (req) => {
      const githubOrgSyncConfig = await server.services.githubOrgSync.updateGithubOrgSync({
        orgPermission: req.permission,
        githubOrgName: req.body.githubOrgName,
        githubOrgAccessToken: req.body.githubOrgAccessToken,
        isActive: req.body.isActive
      });

      return { githubOrgSyncConfig };
    }
  });

  server.route({
    url: "/",
    method: "DELETE",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      response: {
        200: z.object({
          githubOrgSyncConfig: SanitiziedGithubOrgSyncSchema
        })
      }
    },
    handler: async (req) => {
      const githubOrgSyncConfig = await server.services.githubOrgSync.deleteGithubOrgSync({
        orgPermission: req.permission
      });

      return { githubOrgSyncConfig };
    }
  });

  server.route({
    url: "/",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      response: {
        200: z.object({
          githubOrgSyncConfig: SanitiziedGithubOrgSyncSchema
        })
      }
    },
    handler: async (req) => {
      const githubOrgSyncConfig = await server.services.githubOrgSync.getGithubOrgSync({
        orgPermission: req.permission
      });

      return { githubOrgSyncConfig };
    }
  });
};
