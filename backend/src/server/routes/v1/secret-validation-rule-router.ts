import { z } from "zod";

import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import {
  SecretValidationRuleInputSchema,
  SecretValidationRuleResponseSchema,
  staticSecretsInputsSchema
} from "@app/services/secret-validation-rule/secret-validation-rule-schemas";
import { SecretValidationRuleType } from "@app/services/secret-validation-rule/secret-validation-rule-types";

export const registerSecretValidationRuleRouter = async (server: FastifyZodProvider) => {
  // List all rules for a project
  server.route({
    method: "GET",
    url: "/:projectId/secret-validation-rules",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      params: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          rules: SecretValidationRuleResponseSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const rules = await server.services.secretValidationRule.listByProjectId({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId
      });
      return { rules };
    }
  });

  // Create a rule
  server.route({
    method: "POST",
    url: "/:projectId/secret-validation-rules",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      params: z.object({
        projectId: z.string().trim()
      }),
      body: z.object({
        name: z.string().trim().min(1).max(100),
        description: z.string().trim().max(500).nullable().optional(),
        environmentSlug: z.string().trim().min(1).optional(),
        secretPath: z.string().trim().default("/"),
        rule: SecretValidationRuleInputSchema
      }),
      response: {
        200: z.object({
          rule: SecretValidationRuleResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const rule = await server.services.secretValidationRule.createRule({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId,
        name: req.body.name,
        description: req.body.description,
        environmentSlug: req.body.environmentSlug,
        secretPath: req.body.secretPath,
        type: req.body.rule.type,
        inputs: req.body.rule.inputs
      });
      return { rule };
    }
  });

  // Update a rule
  server.route({
    method: "PATCH",
    url: "/:projectId/secret-validation-rules/:ruleId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      params: z.object({
        projectId: z.string().trim(),
        ruleId: z.string().uuid()
      }),
      body: z.object({
        name: z.string().trim().min(1).max(100).optional(),
        description: z.string().trim().max(500).nullable().optional(),
        environmentSlug: z.string().trim().min(1).optional(),
        secretPath: z.string().trim().optional(),
        type: z.nativeEnum(SecretValidationRuleType).optional(),
        inputs: staticSecretsInputsSchema.optional(),
        isActive: z.boolean().optional()
      }),
      response: {
        200: z.object({
          rule: SecretValidationRuleResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const rule = await server.services.secretValidationRule.updateRule({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId,
        ruleId: req.params.ruleId,
        ...req.body
      });
      return { rule };
    }
  });

  // Delete a rule
  server.route({
    method: "DELETE",
    url: "/:projectId/secret-validation-rules/:ruleId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      params: z.object({
        projectId: z.string().trim(),
        ruleId: z.string().uuid()
      }),
      response: {
        200: z.object({
          rule: SecretValidationRuleResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const rule = await server.services.secretValidationRule.deleteRule({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId,
        ruleId: req.params.ruleId
      });
      return { rule };
    }
  });
};
