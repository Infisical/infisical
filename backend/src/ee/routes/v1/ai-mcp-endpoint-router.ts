import { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from "fastify";
import { z } from "zod";

import { AiMcpEndpointServerToolsSchema } from "@app/db/schemas/ai-mcp-endpoint-server-tools";
import { AiMcpEndpointsSchema } from "@app/db/schemas/ai-mcp-endpoints";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ms } from "@app/lib/ms";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const sendWwwAuthenticate = (reply: FastifyReply, endpointId: string, description?: string) => {
  const appCfg = getConfig();
  const protectedResourceMetadataUrl = `${appCfg.SITE_URL}/mcp-endpoints/${endpointId}/.well-known/oauth-protected-resource`;
  let header = `Bearer resource_metadata="${protectedResourceMetadataUrl}", scope="openid"`;
  if (description) header = `${header}, error_description="${description}"`;
  void reply.header("WWW-Authenticate", header);
};

// Custom onRequest hook to enforce auth while returning proper WWW-Authenticate hint for MCP clients
const requireMcpAuthHook = (
  req: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction,
  endpointId: string
) => {
  const { auth } = req;
  if (!auth) {
    sendWwwAuthenticate(reply, endpointId, "Missing authorization header");
    void reply.status(401).send();
    return;
  }

  const allowed = auth.authMode === AuthMode.MCP_JWT;
  if (!allowed) {
    void reply.status(403).send();
    return;
  }

  if (auth.authMode === AuthMode.MCP_JWT && !req.permission.orgId) {
    void reply.status(401).send({ message: "Unauthorized: organization context required" });
    return;
  }

  done();
};

export const registerAiMcpEndpointRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        endpointId: z.string().trim().min(1)
      })
    },
    url: "/:endpointId/connect",
    onRequest: (req, reply, done) => requireMcpAuthHook(req, reply, done, req.params.endpointId),
    handler: async (req, res) => {
      await res.hijack(); // allow manual control of the underlying res

      if (req.auth.authMode !== AuthMode.MCP_JWT) {
        throw new UnauthorizedError({ message: "Unauthorized" });
      }

      if (req.params.endpointId !== req.auth.token.mcp?.endpointId) {
        throw new UnauthorizedError({ message: "Unauthorized" });
      }

      const { server: mcpServer, transport } = await server.services.aiMcpEndpoint.interactWithMcp({
        endpointId: req.params.endpointId,
        userId: req.permission.id,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      // Close transport when client disconnects
      res.raw.on("close", () => {
        void transport.close().catch((err) => {
          logger.error(err, "Failed to close transport for mcp endpoint");
        });
      });

      await mcpServer.connect(transport);
      await transport.handleRequest(req.raw, res.raw, req.body);
    }
  });

  server.route({
    method: ["GET", "DELETE"],
    config: {
      rateLimit: writeLimit
    },
    url: "/:endpointId/connect",

    schema: {
      params: z.object({
        endpointId: z.string().trim().min(1)
      })
    },
    onRequest: (req, reply, done) => requireMcpAuthHook(req, reply, done, req.params.endpointId),
    handler: async (_req, res) => {
      void res
        .status(405)
        .header("Allow", "POST")
        .send({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Method not allowed"
          },
          id: null
        });
    }
  });

  server.route({
    url: "/",
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        projectId: z.string().trim().min(1),
        name: z.string().trim().min(1).max(64),
        description: z.string().trim().max(256).optional(),
        serverIds: z.array(z.string().uuid()).default([])
      }),
      response: {
        200: z.object({
          endpoint: AiMcpEndpointsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const endpoint = await server.services.aiMcpEndpoint.createMcpEndpoint({
        projectId: req.body.projectId,
        name: req.body.name,
        description: req.body.description,
        serverIds: req.body.serverIds,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return { endpoint };
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
        projectId: z.string().trim().min(1)
      }),
      response: {
        200: z.object({
          endpoints: z.array(
            AiMcpEndpointsSchema.extend({
              connectedServers: z.number(),
              activeTools: z.number(),
              piiFiltering: z.boolean().optional()
            })
          ),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const endpoints = await server.services.aiMcpEndpoint.listMcpEndpoints({
        projectId: req.query.projectId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return {
        endpoints,
        totalCount: endpoints.length
      };
    }
  });

  server.route({
    url: "/:endpointId",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        endpointId: z.string().trim().min(1)
      }),
      response: {
        200: z.object({
          endpoint: AiMcpEndpointsSchema.extend({
            connectedServers: z.number(),
            activeTools: z.number(),
            serverIds: z.array(z.string()),
            piiFiltering: z.boolean().optional()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const endpoint = await server.services.aiMcpEndpoint.getMcpEndpointById({
        endpointId: req.params.endpointId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return { endpoint };
    }
  });

  server.route({
    url: "/:endpointId",
    method: "PATCH",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        endpointId: z.string().trim().min(1)
      }),
      body: z.object({
        name: z.string().trim().min(1).max(64).optional(),
        description: z.string().trim().max(256).optional(),
        serverIds: z.array(z.string().uuid()).optional(),
        piiFiltering: z.boolean().optional()
      }),
      response: {
        200: z.object({
          endpoint: AiMcpEndpointsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const endpoint = await server.services.aiMcpEndpoint.updateMcpEndpoint({
        endpointId: req.params.endpointId,
        ...req.body,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return { endpoint };
    }
  });

  server.route({
    url: "/:endpointId",
    method: "DELETE",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        endpointId: z.string().trim().min(1)
      }),
      response: {
        200: z.object({
          endpoint: AiMcpEndpointsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const endpoint = await server.services.aiMcpEndpoint.deleteMcpEndpoint({
        endpointId: req.params.endpointId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return { endpoint };
    }
  });

  server.route({
    url: "/:endpointId/tools",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        endpointId: z.string().trim().min(1)
      }),
      response: {
        200: z.object({
          tools: z.array(AiMcpEndpointServerToolsSchema)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const tools = await server.services.aiMcpEndpoint.listEndpointTools({
        endpointId: req.params.endpointId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return { tools };
    }
  });

  server.route({
    url: "/:endpointId/tools/:serverToolId",
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        endpointId: z.string().trim().min(1),
        serverToolId: z.string().trim().min(1)
      }),
      response: {
        200: z.object({
          tool: AiMcpEndpointServerToolsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const tool = await server.services.aiMcpEndpoint.enableEndpointTool({
        endpointId: req.params.endpointId,
        serverToolId: req.params.serverToolId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return { tool };
    }
  });

  server.route({
    url: "/:endpointId/tools/:serverToolId",
    method: "DELETE",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        endpointId: z.string().trim().min(1),
        serverToolId: z.string().trim().min(1)
      }),
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      await server.services.aiMcpEndpoint.disableEndpointTool({
        endpointId: req.params.endpointId,
        serverToolId: req.params.serverToolId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return { message: "Tool disabled" };
    }
  });

  server.route({
    url: "/:endpointId/tools/bulk",
    method: "PATCH",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        endpointId: z.string().trim().min(1)
      }),
      body: z.object({
        tools: z.array(
          z.object({
            serverToolId: z.string().uuid(),
            isEnabled: z.boolean()
          })
        )
      }),
      response: {
        200: z.object({
          tools: z.array(AiMcpEndpointServerToolsSchema)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const tools = await server.services.aiMcpEndpoint.bulkUpdateEndpointTools({
        endpointId: req.params.endpointId,
        tools: req.body.tools,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return { tools };
    }
  });

  // OAUTH 2.0
  server.route({
    method: "POST",
    url: "/:endpointId/oauth/register",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        endpointId: z.string().trim().min(1)
      }),
      body: z.object({
        redirect_uris: z.array(z.string()),
        token_endpoint_auth_method: z.string(),
        grant_types: z.array(z.string()),
        response_types: z.array(z.string()),
        client_name: z.string(),
        client_uri: z.string().optional()
      }),
      response: {
        200: z.object({
          client_id: z.string(),
          redirect_uris: z.array(z.string()),
          client_name: z.string(),
          client_uri: z.string().optional(),
          grant_types: z.array(z.string()),
          response_types: z.array(z.string()),
          token_endpoint_auth_method: z.string(),
          client_id_issued_at: z.number()
        })
      }
    },
    handler: async (req) => {
      const payload = await server.services.aiMcpEndpoint.oauthRegisterClient({
        endpointId: req.params.endpointId,
        ...req.body
      });
      return payload;
    }
  });

  // OAuth authorize - redirect to scope selection page
  server.route({
    method: "GET",
    url: "/:endpointId/oauth/authorize",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        endpointId: z.string().trim().min(1)
      }),
      querystring: z.object({
        response_type: z.string(),
        client_id: z.string(),
        code_challenge: z.string(),
        code_challenge_method: z.enum(["S256"]),
        redirect_uri: z.string(),
        resource: z.string(),
        state: z.string().optional()
      })
    },
    handler: async (req, res) => {
      await server.services.aiMcpEndpoint.oauthAuthorizeClient({
        clientId: req.query.client_id,
        state: req.query.state
      });
      const query = new URLSearchParams({
        ...req.query,
        endpointId: req.params.endpointId
      }).toString();

      void res.redirect(`/organization/mcp-endpoint-finalize?${query}`);
    }
  });

  server.route({
    method: "POST",
    url: "/:endpointId/oauth/finalize",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        endpointId: z.string().trim().min(1)
      }),
      body: z.object({
        response_type: z.string(),
        client_id: z.string(),
        code_challenge: z.string(),
        code_challenge_method: z.enum(["S256"]),
        redirect_uri: z.string(),
        resource: z.string(),
        expireIn: z.string().refine((val) => ms(val) > 0, "Max TTL must be a positive number")
      }),
      response: {
        200: z.object({
          callbackUrl: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const userInfo = req.auth.authMode === AuthMode.JWT ? req.auth.user : null;
      if (!userInfo) throw new BadRequestError({ message: "User info not found" });

      const redirectUri = await server.services.aiMcpEndpoint.oauthFinalize({
        endpointId: req.params.endpointId,
        clientId: req.body.client_id,
        codeChallenge: req.body.code_challenge,
        codeChallengeMethod: req.body.code_challenge_method,
        redirectUri: req.body.redirect_uri,
        resource: req.body.resource,
        responseType: req.body.response_type,
        tokenId: req.auth.authMode === AuthMode.JWT ? req.auth.tokenVersionId : "",
        userInfo,
        expiry: req.body.expireIn,
        permission: req.permission,
        userAgent: req.auditLogInfo.userAgent || "",
        userIp: req.auditLogInfo.ipAddress || ""
      });

      return { callbackUrl: redirectUri.toString() };
    }
  });

  server.route({
    method: "POST",
    url: "/:endpointId/oauth/token",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        endpointId: z.string().trim().min(1)
      }),
      body: z.object({
        grant_type: z.literal("authorization_code"),
        code: z.string(),
        redirect_uri: z.string().url(),
        code_verifier: z.string(),
        client_id: z.string()
      }),
      response: {
        200: z.object({
          access_token: z.string(),
          token_type: z.string(),
          expires_in: z.number(),
          scope: z.string()
        })
      }
    },
    handler: async (req) => {
      const payload = await server.services.aiMcpEndpoint.oauthTokenExchange({
        endpointId: req.params.endpointId,
        ...req.body
      });
      return payload;
    }
  });

  // Get servers requiring personal authentication
  server.route({
    method: "GET",
    url: "/:endpointId/servers-requiring-auth",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        endpointId: z.string().trim().min(1)
      }),
      response: {
        200: z.object({
          servers: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              url: z.string(),
              hasCredentials: z.boolean()
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const servers = await server.services.aiMcpEndpoint.getServersRequiringAuth({
        endpointId: req.params.endpointId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return { servers };
    }
  });

  // Initiate OAuth for a server (personal credential mode)
  server.route({
    method: "POST",
    url: "/:endpointId/servers/:serverId/oauth/initiate",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        endpointId: z.string().trim().min(1),
        serverId: z.string().trim().min(1)
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
      const result = await server.services.aiMcpEndpoint.initiateServerOAuth({
        endpointId: req.params.endpointId,
        serverId: req.params.serverId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return result;
    }
  });

  // Save user credentials after OAuth completes
  server.route({
    method: "POST",
    url: "/:endpointId/servers/:serverId/credentials",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        endpointId: z.string().trim().min(1),
        serverId: z.string().trim().min(1)
      }),
      body: z.object({
        accessToken: z.string().min(1),
        refreshToken: z.string().optional(),
        expiresAt: z.number().optional(),
        tokenType: z.string().optional()
      }),
      response: {
        200: z.object({
          success: z.boolean()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const result = await server.services.aiMcpEndpoint.saveUserServerCredential({
        endpointId: req.params.endpointId,
        serverId: req.params.serverId,
        ...req.body,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return result;
    }
  });
};
