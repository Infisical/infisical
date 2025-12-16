import { z } from "zod";

import { AiMcpServerToolsSchema } from "@app/db/schemas/ai-mcp-server-tools";
import { AiMcpServersSchema } from "@app/db/schemas/ai-mcp-servers";
import { AiMcpServerAuthMethod, AiMcpServerCredentialMode } from "@app/ee/services/ai-mcp-server/ai-mcp-server-enum";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

// Common fields for MCP server creation
const CreateMcpServerBaseSchema = z.object({
  projectId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(64),
  url: z.string().trim().url(),
  description: z.string().trim().max(256).optional(),
  credentialMode: z.nativeEnum(AiMcpServerCredentialMode),
  oauthClientId: z.string().trim().min(1).optional(),
  oauthClientSecret: z.string().trim().min(1).optional()
});

const McpServerCredentialsSchema = z.discriminatedUnion("authMethod", [
  z.object({
    authMethod: z.literal(AiMcpServerAuthMethod.BASIC),
    credentials: z.object({
      username: z.string().min(1),
      password: z.string().min(1)
    })
  }),
  z.object({
    authMethod: z.literal(AiMcpServerAuthMethod.BEARER),
    credentials: z.object({
      token: z.string().min(1)
    })
  }),
  z.object({
    authMethod: z.literal(AiMcpServerAuthMethod.OAUTH),
    credentials: z.object({
      accessToken: z.string().min(1),
      refreshToken: z.string().optional(),
      expiresAt: z.number().optional(),
      tokenType: z.string().optional()
    })
  })
]);

export const registerAiMcpServerRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/oauth/initiate",
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        projectId: z.string().trim().min(1),
        url: z.string().trim().url(),
        clientId: z.string().trim().min(1).optional(),
        clientSecret: z.string().trim().min(1).optional()
      }),
      response: {
        200: z.object({
          authUrl: z.string(),
          sessionId: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const result = await server.services.aiMcpServer.initiateOAuth({
        projectId: req.body.projectId,
        url: req.body.url,
        clientId: req.body.clientId,
        clientSecret: req.body.clientSecret,
        actorId: req.permission.id
      });

      return result;
    }
  });

  // OAuth: Callback (redirect from MCP server)
  server.route({
    url: "/oauth/callback",
    method: "GET",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      querystring: z.object({
        code: z.string(),
        state: z.string() // session ID
      })
    },
    handler: async (req, res) => {
      const { code, state: sessionId } = req.query;

      try {
        await server.services.aiMcpServer.handleOAuthCallback({
          sessionId,
          code
        });

        // Return HTML that closes the popup immediately
        return await res.type("text/html").send(`
          <!DOCTYPE html>
          <html>
            <head><title>OAuth Complete</title></head>
            <body>
              <script>window.close();</script>
            </body>
          </html>
        `);
      } catch {
        // Return error HTML that closes immediately
        return res.type("text/html").send(`
          <!DOCTYPE html>
          <html>
            <head><title>OAuth Error</title></head>
            <body>
              <script>window.close();</script>
            </body>
          </html>
        `);
      }
    }
  });

  server.route({
    url: "/oauth/status/:sessionId",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        sessionId: z.string()
      }),
      response: {
        200: z.object({
          authorized: z.boolean(),
          accessToken: z.string().optional(),
          refreshToken: z.string().optional(),
          expiresAt: z.number().optional(),
          tokenType: z.string().optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const result = await server.services.aiMcpServer.getOAuthStatus({
        sessionId: req.params.sessionId,
        actorId: req.permission.id
      });

      return result;
    }
  });

  // Create MCP Server
  server.route({
    url: "/",
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: CreateMcpServerBaseSchema.and(McpServerCredentialsSchema),
      response: {
        200: z.object({
          server: AiMcpServersSchema.omit({ encryptedCredentials: true, encryptedOauthConfig: true })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const mcpServer = await server.services.aiMcpServer.createMcpServer({
        ...req.body,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod!,
        actorOrgId: req.permission.orgId
      });

      return { server: mcpServer };
    }
  });

  server.route({
    url: "/",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({
        projectId: z.string().trim().min(1),
        limit: z.coerce.number().min(1).max(100).default(100),
        offset: z.coerce.number().min(0).default(0)
      }),
      response: {
        200: z.object({
          servers: z.array(AiMcpServersSchema.omit({ encryptedCredentials: true, encryptedOauthConfig: true })),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const mcpServers = await server.services.aiMcpServer.listMcpServers({
        projectId: req.query.projectId
      });

      return {
        servers: mcpServers,
        totalCount: mcpServers.length
      };
    }
  });

  server.route({
    url: "/:serverId",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        serverId: z.string().trim().min(1)
      }),
      response: {
        200: z.object({
          server: AiMcpServersSchema.omit({ encryptedCredentials: true, encryptedOauthConfig: true })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const mcpServer = await server.services.aiMcpServer.getMcpServerById({
        serverId: req.params.serverId
      });

      return { server: mcpServer };
    }
  });

  server.route({
    url: "/:serverId",
    method: "PATCH",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        serverId: z.string().trim().min(1)
      }),
      body: z.object({
        name: z.string().trim().min(1).max(64).optional(),
        description: z.string().trim().max(256).optional()
      }),
      response: {
        200: z.object({
          server: AiMcpServersSchema.omit({ encryptedCredentials: true, encryptedOauthConfig: true })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const mcpServer = await server.services.aiMcpServer.updateMcpServer({
        serverId: req.params.serverId,
        ...req.body
      });

      return { server: mcpServer };
    }
  });

  server.route({
    url: "/:serverId/tools",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        serverId: z.string().trim().min(1)
      }),
      response: {
        200: z.object({
          tools: z.array(AiMcpServerToolsSchema)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const tools = await server.services.aiMcpServer.listMcpServerTools({
        serverId: req.params.serverId
      });

      return { tools };
    }
  });

  server.route({
    url: "/:serverId/tools/sync",
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        serverId: z.string().trim().min(1)
      }),
      response: {
        200: z.object({
          tools: z.array(AiMcpServerToolsSchema)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const tools = await server.services.aiMcpServer.syncMcpServerTools({
        serverId: req.params.serverId
      });

      return { tools };
    }
  });

  server.route({
    url: "/:serverId",
    method: "DELETE",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        serverId: z.string().trim().min(1)
      }),
      response: {
        200: z.object({
          server: AiMcpServersSchema.omit({ encryptedCredentials: true, encryptedOauthConfig: true })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const mcpServer = await server.services.aiMcpServer.deleteMcpServer({
        serverId: req.params.serverId
      });

      return { server: mcpServer };
    }
  });
};
