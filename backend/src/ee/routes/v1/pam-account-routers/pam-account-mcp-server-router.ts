import { z } from "zod";

import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerPamAccountMcpServerRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:accountId/oauth/authorize",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "MCP server oauthorization",
      params: z.object({
        accountId: z.string().uuid()
      }),
      response: {
        200: z.object({
          authUrl: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const authUrl = await server.services.pamMcpServer.handleMcpServerOauthAuthorize(
        req.permission,
        req.params.accountId
      );

      return { authUrl: authUrl.toString() };
    }
  });

  server.route({
    method: "POST",
    url: "/:accountId/oauth/callback",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "MCP server oauthorization callback",
      params: z.object({
        accountId: z.string().trim()
      }),
      body: z.object({
        code: z.string().trim()
      }),
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      await server.services.pamMcpServer.handleMcpServerOauthCallback(
        req.permission,
        req.params.accountId,
        req.body.code
      );

      return { message: "MCP server oauth success" };
    }
  });
};
