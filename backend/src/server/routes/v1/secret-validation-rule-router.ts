import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import {
  SecretValidationRuleInputSchema,
  SecretValidationRuleResponseSchema
} from "@app/services/secret-validation-rule/secret-validation-rule-schemas";
import { SecretValidationRuleType } from "@app/services/secret-validation-rule/secret-validation-rule-types";
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
      description: "List secret validation rules for a project",
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
      operationId: "createSecretValidationRule",
      description: "Create a secret validation rule for a project",
      params: z.object({
        projectId: z.string().trim()
      }),
      body: z.object({
        name: z.string().trim().min(1).max(100),
        description: z.string().trim().max(500).nullable().optional(),
        environmentSlug: z.string().trim().min(1).optional(),
        secretPath: z.string().trim().min(1),
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
      description: "Update a secret validation rule",
      params: z.object({
        projectId: z.string().trim(),
        ruleId: z.string().uuid()
      }),
      body: z.object({
        name: z.string().trim().min(1).max(100).optional(),
        description: z.string().trim().max(500).nullable().optional(),
        environmentSlug: z.string().trim().min(1).nullable().optional(),
        secretPath: z.string().trim().min(1).optional(),
        type: z.nativeEnum(SecretValidationRuleType).optional(),
        // Inputs are validated strictly in the service against the resolved
        // rule type via `parseSecretValidationRuleInputs`. We can't pick the
        // right schema here because `type` and `inputs` are sibling fields,
        // so a union over the per-type input schemas would silently strip
        // fields (e.g. `providers`) whenever a sibling member also matched.
        inputs: z.object({}).passthrough().optional(),
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

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.params.projectId,
        event: {
          type: EventType.SECRET_VALIDATION_RULE_UPDATE,
          metadata: {
            ruleId: req.params.ruleId,
            name: req.body.name,
            type: req.body.type,
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
      description: "Delete a secret validation rule",
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
