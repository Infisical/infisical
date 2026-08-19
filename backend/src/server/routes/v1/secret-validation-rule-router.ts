import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, SECRET_VALIDATION_RULES } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import {
  SecretValidationRuleResponseSchema,
  SecretValidationRuleSchema
} from "@app/services/secret-validation-rule/secret-validation-rule-schemas";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

export const registerSecretValidationRuleRouter = async (server: FastifyZodProvider) => {
  // List all rules for a project
  server.route({
    method: "GET",
    url: "/:projectId/secret-validation-rules",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listSecretValidationRules",
      tags: [ApiDocsTags.SecretValidationRules],
      description: "List Secret Validation Rules",
      params: z.object({
        projectId: z.string().trim().describe(SECRET_VALIDATION_RULES.LIST.projectId)
      }),
      response: {
        200: z.object({
          rules: SecretValidationRuleResponseSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
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
      operationId: "createSecretValidationRule",
      tags: [ApiDocsTags.SecretValidationRules],
      description: "Create Secret Validation Rule",
      params: z.object({
        projectId: z.string().trim().describe(SECRET_VALIDATION_RULES.CREATE.projectId)
      }),
      body: z.object({
        name: z.string().trim().min(1).max(100).describe(SECRET_VALIDATION_RULES.CREATE.name),
        description: z
          .string()
          .trim()
          .max(500)
          .nullable()
          .optional()
          .describe(SECRET_VALIDATION_RULES.CREATE.description),
        environmentSlug: z.string().trim().min(1).optional().describe(SECRET_VALIDATION_RULES.CREATE.environmentSlug),
        secretPath: z.string().trim().min(1).describe(SECRET_VALIDATION_RULES.CREATE.secretPath),
        rule: SecretValidationRuleSchema.describe(SECRET_VALIDATION_RULES.CREATE.rule)
      }),
      response: {
        200: z.object({
          rule: SecretValidationRuleResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
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
        rule: req.body.rule
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.params.projectId,
        event: {
          type: EventType.SECRET_VALIDATION_RULE_CREATE,
          metadata: {
            ruleId: rule.id,
            name: rule.name,
            type: rule.type,
            environmentSlug: req.body.environmentSlug,
            secretPath: rule.secretPath
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.SecretValidationRuleCreated,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: { ruleId: rule.id, projectId: req.params.projectId }
        })
        .catch(() => {});

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
      operationId: "updateSecretValidationRule",
      tags: [ApiDocsTags.SecretValidationRules],
      description: "Update Secret Validation Rule",
      params: z.object({
        projectId: z.string().trim().describe(SECRET_VALIDATION_RULES.UPDATE.projectId),
        ruleId: z.string().uuid().describe(SECRET_VALIDATION_RULES.UPDATE.ruleId)
      }),
      body: z.object({
        name: z.string().trim().min(1).max(100).optional().describe(SECRET_VALIDATION_RULES.UPDATE.name),
        description: z
          .string()
          .trim()
          .max(500)
          .nullable()
          .optional()
          .describe(SECRET_VALIDATION_RULES.UPDATE.description),
        environmentSlug: z
          .string()
          .trim()
          .min(1)
          .nullable()
          .optional()
          .describe(SECRET_VALIDATION_RULES.UPDATE.environmentSlug),
        secretPath: z.string().trim().min(1).optional().describe(SECRET_VALIDATION_RULES.UPDATE.secretPath),
        // The rule config is replaced as a whole when supplied — `type` and the
        // per-type fields have to move together for the discriminant to be
        // meaningful. Omit it to leave the stored config untouched.
        rule: SecretValidationRuleSchema.optional().describe(SECRET_VALIDATION_RULES.UPDATE.rule),
        isActive: z.boolean().optional().describe(SECRET_VALIDATION_RULES.UPDATE.isActive)
      }),
      response: {
        200: z.object({
          rule: SecretValidationRuleResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
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

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.params.projectId,
        event: {
          type: EventType.SECRET_VALIDATION_RULE_UPDATE,
          metadata: {
            ruleId: req.params.ruleId,
            name: req.body.name,
            type: req.body.rule?.type,
            environmentSlug: req.body.environmentSlug,
            secretPath: req.body.secretPath,
            isActive: req.body.isActive
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.SecretValidationRuleUpdated,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            ruleId: rule.id,
            projectId: req.params.projectId
          }
        })
        .catch(() => {});

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
      operationId: "deleteSecretValidationRule",
      tags: [ApiDocsTags.SecretValidationRules],
      description: "Delete Secret Validation Rule",
      params: z.object({
        projectId: z.string().trim().describe(SECRET_VALIDATION_RULES.DELETE.projectId),
        ruleId: z.string().uuid().describe(SECRET_VALIDATION_RULES.DELETE.ruleId)
      }),
      response: {
        200: z.object({
          rule: SecretValidationRuleResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const rule = await server.services.secretValidationRule.deleteRule({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId,
        ruleId: req.params.ruleId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.params.projectId,
        event: {
          type: EventType.SECRET_VALIDATION_RULE_DELETE,
          metadata: {
            ruleId: req.params.ruleId,
            name: rule.name
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.SecretValidationRuleDeleted,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            ruleId: rule.id,
            projectId: req.params.projectId
          }
        })
        .catch(() => {});

      return { rule };
    }
  });
};
