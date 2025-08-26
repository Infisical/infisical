import { z } from "zod";

import { getConfig } from "@app/lib/config/env";
import { UnauthorizedError } from "@app/lib/errors";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerProxyRouter = async (server: FastifyZodProvider) => {
  const appCfg = getConfig();

  server.route({
    method: "POST",
    url: "/register-instance-proxy",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        ip: z.string(),
        name: z.string()
      }),
      response: {
        200: z.any()
      }
    },
    onRequest: (req, _, next) => {
      const authHeader = req.headers.authorization;

      if (appCfg.PROXY_AUTH_SECRET && authHeader === `Bearer ${appCfg.PROXY_AUTH_SECRET}`) {
        return next();
      }

      throw new UnauthorizedError({
        message: "Invalid proxy auth secret"
      });
    },
    handler: async (req) => {
      return server.services.proxy.registerProxy({
        ...req.body
      });
    }
  });

  server.route({
    method: "POST",
    url: "/register-org-proxy",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        ip: z.string(),
        name: z.string()
      }),
      response: {
        200: z.any()
      }
    },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.proxy.registerProxy({
        ...req.body,
        identityId: req.permission.id,
        orgId: req.permission.orgId
      });
    }
  });
};
