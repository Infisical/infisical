import { z } from "zod";

import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const SanitizedGitHubAppSchema = z.object({
  id: z.string().uuid().nullable(),
  orgId: z.string().uuid(),
  name: z.string(),
  appId: z.string(),
  slug: z.string(),
  owner: z.string().nullable(),
  connectionCount: z.number(),
  createdAt: z.date().nullable(),
  updatedAt: z.date().nullable()
});

export const registerGitHubAppRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/manifest/initiate",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      body: z.object({
        name: z.string().trim().min(1).max(64),
        instanceType: z.enum(["cloud", "server"]).default("cloud"),
        githubOrg: z.string().trim().optional(),
        githubHost: z.string().trim().optional(),
        installState: z.string().trim().min(1)
      }),
      response: {
        200: z.object({
          state: z.string(),
          manifest: z.record(z.unknown()),
          githubActionUrl: z.string()
        })
      }
    },
    handler: async (req) => {
      const result = await server.services.gitHubApp.initiateManifestCreation({
        orgPermission: req.permission,
        name: req.body.name,
        instanceType: req.body.instanceType,
        githubOrg: req.body.githubOrg,
        githubHost: req.body.githubHost,
        installState: req.body.installState
      });

      return result;
    }
  });

  server.route({
    method: "GET",
    url: "/manifest/callback",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      querystring: z.object({
        code: z.string().trim().min(1),
        state: z.string().trim().min(1)
      })
    },
    handler: async (req, reply) => {
      const { redirectUrl } = await server.services.gitHubApp.handleManifestCallback({
        code: req.query.code,
        state: req.query.state
      });

      return reply.redirect(redirectUrl);
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      response: {
        200: z.object({
          gitHubApps: SanitizedGitHubAppSchema.array()
        })
      }
    },
    handler: async (req) => {
      const gitHubApps = await server.services.gitHubApp.listGitHubApps({
        orgPermission: req.permission
      });

      return { gitHubApps };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:id",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        id: z.string().uuid()
      }),
      response: {
        200: z.object({
          gitHubApp: SanitizedGitHubAppSchema
        })
      }
    },
    handler: async (req) => {
      const gitHubApp = await server.services.gitHubApp.deleteGitHubApp({
        orgPermission: req.permission,
        id: req.params.id
      });

      return { gitHubApp };
    }
  });
};
