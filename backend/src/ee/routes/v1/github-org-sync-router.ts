import { z } from "zod";

import { GithubOrgSyncConfigsSchema } from "@app/db/schemas/github-org-sync-configs";
import { CharacterType, zodValidateCharacters } from "@app/lib/validator/validate-string";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const SanitizedGithubOrgSyncSchema = GithubOrgSyncConfigsSchema.pick({
  isActive: true,
  id: true,
  createdAt: true,
  updatedAt: true,
  orgId: true,
  githubOrgName: true
});

const githubOrgNameValidator = zodValidateCharacters([CharacterType.AlphaNumeric, CharacterType.Hyphen]);
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
        githubOrgName: githubOrgNameValidator(z.string().trim(), "GitHub Org Name"),
        githubOrgAccessToken: z.string().trim().max(1000).optional(),
        isActive: z.boolean().default(false)
      }),
      response: {
        200: z.object({
          githubOrgSyncConfig: SanitizedGithubOrgSyncSchema
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
          githubOrgName: githubOrgNameValidator(z.string().trim(), "GitHub Org Name"),
          githubOrgAccessToken: z.string().trim().max(1000),
          isActive: z.boolean()
        })
        .partial(),
      response: {
        200: z.object({
          githubOrgSyncConfig: SanitizedGithubOrgSyncSchema
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
          githubOrgSyncConfig: SanitizedGithubOrgSyncSchema
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
          githubOrgSyncConfig: SanitizedGithubOrgSyncSchema
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

  server.route({
    url: "/sync-all-teams",
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      response: {
        200: z.object({
          totalUsers: z.number(),
          errors: z.array(z.string()),
          createdTeams: z.array(z.string()),
          updatedTeams: z.array(z.string()),
          removedMemberships: z.number(),
          syncDuration: z.number()
        })
      }
    },
    handler: async (req) => {
      const result = await server.services.githubOrgSync.syncAllTeams({
        orgPermission: req.permission
      });

      return {
        totalUsers: result.totalUsers,
        errors: result.errors,
        createdTeams: result.createdTeams,
        updatedTeams: result.updatedTeams,
        removedMemberships: result.removedMemberships,
        syncDuration: result.syncDuration
      };
    }
  });
};
