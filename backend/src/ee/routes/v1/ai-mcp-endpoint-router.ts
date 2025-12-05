import { z } from "zod";

import { AiMcpEndpointServerToolsSchema } from "@app/db/schemas/ai-mcp-endpoint-server-tools";
import { AiMcpEndpointsSchema } from "@app/db/schemas/ai-mcp-endpoints";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerAiMcpEndpointRouter = async (server: FastifyZodProvider) => {
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
        serverIds: req.body.serverIds
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
              activeTools: z.number()
            })
          ),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const endpoints = await server.services.aiMcpEndpoint.listMcpEndpoints({
        projectId: req.query.projectId
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
            serverIds: z.array(z.string())
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const endpoint = await server.services.aiMcpEndpoint.getMcpEndpointById({
        endpointId: req.params.endpointId
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
        serverIds: z.array(z.string().uuid()).optional()
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
        ...req.body
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
        endpointId: req.params.endpointId
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
        endpointId: req.params.endpointId
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
        serverToolId: req.params.serverToolId
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
        serverToolId: req.params.serverToolId
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
        tools: req.body.tools
      });

      return { tools };
    }
  });
};
