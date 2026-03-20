import { z } from "zod";

import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const RotationRuleResponseSchema = z.object({
  id: z.string().uuid(),
  resourceId: z.string().uuid(),
  name: z.string().nullable().optional(),
  namePattern: z.string(),
  enabled: z.boolean(),
  intervalSeconds: z.number().nullable().optional(),
  priority: z.number(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const registerPamResourceRotationRulesRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:resourceId/rotation-rules",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listPamRotationRules",
      description: "List rotation rules for a PAM resource",
      params: z.object({
        resourceId: z.string().uuid()
      }),
      response: {
        200: z.object({
          rules: RotationRuleResponseSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const rules = await server.services.pamResourceRotationRules.listByResourceId(
        req.params.resourceId,
        req.permission
      );

      return { rules };
    }
  });

  server.route({
    method: "POST",
    url: "/:resourceId/rotation-rules",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "createPamRotationRule",
      description: "Create a rotation rule for a PAM resource",
      params: z.object({
        resourceId: z.string().uuid()
      }),
      body: z.object({
        name: z.string().max(255).optional(),
        namePattern: z.string().min(1).max(255),
        enabled: z.boolean().default(true),
        intervalSeconds: z.number().min(3600).nullable().optional()
      }),
      response: {
        200: z.object({
          rule: RotationRuleResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const rule = await server.services.pamResourceRotationRules.create(
        {
          resourceId: req.params.resourceId,
          ...req.body
        },
        req.permission
      );

      return { rule };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:resourceId/rotation-rules/:ruleId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "updatePamRotationRule",
      description: "Update a rotation rule",
      params: z.object({
        resourceId: z.string().uuid(),
        ruleId: z.string().uuid()
      }),
      body: z.object({
        name: z.string().max(255).nullable().optional(),
        namePattern: z.string().min(1).max(255).optional(),
        enabled: z.boolean().optional(),
        intervalSeconds: z.number().min(3600).nullable().optional()
      }),
      response: {
        200: z.object({
          rule: RotationRuleResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const rule = await server.services.pamResourceRotationRules.updateById(
        req.params.resourceId,
        req.params.ruleId,
        req.body,
        req.permission
      );

      return { rule };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:resourceId/rotation-rules/:ruleId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "deletePamRotationRule",
      description: "Delete a rotation rule",
      params: z.object({
        resourceId: z.string().uuid(),
        ruleId: z.string().uuid()
      }),
      response: {
        200: z.object({
          rule: RotationRuleResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const rule = await server.services.pamResourceRotationRules.deleteById(
        req.params.resourceId,
        req.params.ruleId,
        req.permission
      );

      return { rule };
    }
  });

  server.route({
    method: "PUT",
    url: "/:resourceId/rotation-rules/reorder",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "reorderPamRotationRules",
      description: "Reorder rotation rules for a resource",
      params: z.object({
        resourceId: z.string().uuid()
      }),
      body: z.object({
        ruleIds: z.array(z.string().uuid())
      }),
      response: {
        200: z.object({
          rules: RotationRuleResponseSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const rules = await server.services.pamResourceRotationRules.reorderRules(
        req.params.resourceId,
        req.body.ruleIds,
        req.permission
      );

      return { rules };
    }
  });
};
