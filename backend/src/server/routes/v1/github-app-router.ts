import { z } from "zod";

import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const SanitizedGitHubAppSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  name: z.string(),
  appId: z.string(),
  slug: z.string(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const registerGitHubAppRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/manifest/exchange",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      body: z.object({
        name: z.string().trim().min(1).max(64),
        code: z.string().trim().min(1)
      }),
      response: {
        200: z.object({
          gitHubApp: SanitizedGitHubAppSchema
        })
      }
    },
    handler: async (req) => {
      const gitHubApp = await server.services.gitHubApp.exchangeManifestCode({
        orgPermission: req.permission,
        name: req.body.name,
        code: req.body.code
      });

      return { gitHubApp };
    }
  });

  server.route({
    method: "POST",
    url: "/register",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      body: z.object({
        name: z.string().trim().min(1).max(64),
        appId: z.string().trim().min(1),
        slug: z.string().trim().min(1),
        clientId: z.string().trim().min(1),
        clientSecret: z.string().trim().min(1),
        privateKey: z.string().trim().min(1)
      }),
      response: {
        200: z.object({
          gitHubApp: SanitizedGitHubAppSchema
        })
      }
    },
    handler: async (req) => {
      const gitHubApp = await server.services.gitHubApp.registerGitHubApp({
        orgPermission: req.permission,
        name: req.body.name,
        appId: req.body.appId,
        slug: req.body.slug,
        clientId: req.body.clientId,
        clientSecret: req.body.clientSecret,
        privateKey: req.body.privateKey
      });

      return { gitHubApp };
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
