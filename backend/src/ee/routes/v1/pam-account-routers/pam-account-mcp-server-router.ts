import { z } from "zod";

import { PamMcpServerConfigurationSchema } from "@app/ee/services/pam-account/pam-mcp-server-service";
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

  server.route({
    method: "POST",
    url: "/:accountId/config",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "MCP account configuration",
      params: z.object({
        accountId: z.string().trim()
      }),
      body: z.object({
        config: PamMcpServerConfigurationSchema
      }),
      response: {
        200: z.object({
          config: PamMcpServerConfigurationSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const config = await server.services.pamMcpServer.updateMcpAccountConfiguredRules(
        req.permission,
        req.params.accountId,
        req.body.config
      );

      return { config };
    }
  });

  server.route({
    method: "GET",
    url: "/:accountId/config",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "MCP account configuration",
      params: z.object({
        accountId: z.string().trim()
      }),
      response: {
        200: z.object({
          config: PamMcpServerConfigurationSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const config = await server.services.pamMcpServer.listMcpAccountConfiguredRules(
        req.permission,
        req.params.accountId
      );

      return { config };
    }
  });

  server.route({
    method: "GET",
    url: "/:accountId/tools",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "MCP account tools available",
      params: z.object({
        accountId: z.string().trim()
      }),
      response: {
        200: z.object({
          tools: z
            .object({
              name: z.string(),
              description: z.string().optional()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const tools = await server.services.pamMcpServer.listMcpTools(req.permission, req.params.accountId);

      return { tools };
    }
  });
};
