import { z } from "zod";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { readLimit } from "@app/server/config/rateLimiter";
import { BridgeSchema } from "@app/db/schemas";

const BridgeRuleSchema = z.object({
  field: z.string(),
  operator: z.string(),
  value: z.string()
});

const SanitizedBridgeSchema = BridgeSchema.omit({
  encryptedHeaders: true
}).extend({
  headers: z.object({ key: z.string(), value: z.string() }).array().nullable().optional()
});

export const registerBridgeRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      body: z.object({
        projectId: z.string(),
        baseUrl: z.string(),
        openApiUrl: z.string(),
        slug: z.string(),
        ruleSet: BridgeRuleSchema.array().array(),
        headers: z
          .object({
            key: z.string(),
            value: z.string()
          })
          .array()
          .optional()
      }),
      response: {
        200: z.object({
          bridge: SanitizedBridgeSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const bridge = await server.services.bridge.create({
        projectPermission: req.permission,
        projectId: req.body.projectId,
        baseUrl: req.body.baseUrl,
        openApiUrl: req.body.openApiUrl,
        slug: req.body.slug,
        headers: req.body.headers,
        ruleSet: req.body.ruleSet
      });

      return { bridge };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({
        projectId: z.string()
      }),
      response: {
        200: z.object({
          bridges: SanitizedBridgeSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const bridges = await server.services.bridge.listByProjectId({
        projectPermission: req.permission,
        projectId: req.query.projectId
      });

      return { bridges };
    }
  });

  server.route({
    method: "GET",
    url: "/:bridgeId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        bridgeId: z.string()
      }),
      response: {
        200: z.object({
          bridge: SanitizedBridgeSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const bridge = await server.services.bridge.getById({
        id: req.params.bridgeId
      });

      return { bridge };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:bridgeId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        bridgeId: z.string()
      }),
      body: z.object({
        baseUrl: z.string().optional(),
        openApiUrl: z.string().optional(),
        ruleSet: BridgeRuleSchema.array().array().optional(),
        headers: z
          .object({
            key: z.string(),
            value: z.string()
          })
          .array()
          .optional()
      }),
      response: {
        200: z.object({
          bridge: SanitizedBridgeSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const bridge = await server.services.bridge.updateById({
        projectPermission: req.permission,
        id: req.params.bridgeId,
        baseUrl: req.body.baseUrl,
        openApiUrl: req.body.openApiUrl,
        headers: req.body.headers,
        ruleSet: req.body.ruleSet
      });

      return { bridge };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:bridgeId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        bridgeId: z.string()
      }),
      response: {
        200: z.object({
          bridge: SanitizedBridgeSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const bridge = await server.services.bridge.deleteById({
        projectPermission: req.permission,
        id: req.params.bridgeId
      });

      return { bridge };
    }
  });
};
