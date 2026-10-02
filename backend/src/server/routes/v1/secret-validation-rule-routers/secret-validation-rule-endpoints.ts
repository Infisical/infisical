import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, SecretValidationRules } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { SecretValidationRuleType } from "@app/services/secret-validation-rule/secret-validation-rule-enums";
import { SECRET_VALIDATION_RULE_NAME_MAP } from "@app/services/secret-validation-rule/secret-validation-rule-maps";
import {
  TCreateSecretValidationRuleDTO,
  TSecretValidationRule,
  TUpdateSecretValidationRuleDTO
} from "@app/services/secret-validation-rule/secret-validation-rule-types";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

const toPascalCase = (type: SecretValidationRuleType) =>
  type
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

export const registerSecretValidationRuleEndpoints = <T extends TSecretValidationRule>({
  server,
  type,
  createSchema,
  updateSchema,
  responseSchema
}: {
  server: FastifyZodProvider;
  type: SecretValidationRuleType;
  // The input side is left open: each rule type's schema accepts its own config fields and applies
  // its own defaults, while the parsed body always lands on the shape the service takes.
  createSchema: z.ZodType<Omit<TCreateSecretValidationRuleDTO, "type">, z.ZodTypeDef, unknown>;
  updateSchema: z.ZodType<Omit<TUpdateSecretValidationRuleDTO, "type" | "ruleId">, z.ZodTypeDef, unknown>;
  responseSchema: z.ZodTypeAny;
}) => {
  const typeName = SECRET_VALIDATION_RULE_NAME_MAP[type];
  const opId = toPascalCase(type);

  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: `list${opId}ValidationRules`,
      tags: [ApiDocsTags.SecretValidationRules],
      description: `List the ${typeName} Validation Rules for the specified project.`,
      querystring: z.object({
        projectId: z.string().trim().min(1).max(36).describe(SecretValidationRules.LIST(type).projectId)
      }),
      response: { 200: z.object({ secretValidationRules: responseSchema.array() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const secretValidationRules = (await server.services.secretValidationRule.listSecretValidationRules(
        { projectId: req.query.projectId, type },
        req.permission
      )) as T[];

      return { secretValidationRules };
    }
  });

  server.route({
    method: "GET",
    url: "/:ruleId",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: `get${opId}ValidationRule`,
      tags: [ApiDocsTags.SecretValidationRules],
      description: `Get the specified ${typeName} Validation Rule by ID.`,
      params: z.object({
        ruleId: z.string().uuid().describe(SecretValidationRules.GET_BY_ID(type).ruleId)
      }),
      response: { 200: z.object({ secretValidationRule: responseSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const secretValidationRule = (await server.services.secretValidationRule.findSecretValidationRuleById(
        { ruleId: req.params.ruleId, type },
        req.permission
      )) as T;

      return { secretValidationRule };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: `create${opId}ValidationRule`,
      tags: [ApiDocsTags.SecretValidationRules],
      description: `Create a ${typeName} Validation Rule for the specified project.`,
      body: createSchema,
      response: { 201: z.object({ secretValidationRule: responseSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const secretValidationRule = (await server.services.secretValidationRule.createSecretValidationRule(
        { ...req.body, type },
        req.permission
      )) as T;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: secretValidationRule.projectId,
        event: {
          type: EventType.SECRET_VALIDATION_RULE_CREATE,
          metadata: {
            ruleId: secretValidationRule.id,
            name: secretValidationRule.name,
            type,
            environment: secretValidationRule.environment?.slug,
            secretPath: secretValidationRule.secretPath,
            isActive: secretValidationRule.isActive
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.SecretValidationRuleCreated,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: { ruleId: secretValidationRule.id, projectId: secretValidationRule.projectId, type }
        })
        .catch(() => {});

      return { secretValidationRule };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:ruleId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: `update${opId}ValidationRule`,
      tags: [ApiDocsTags.SecretValidationRules],
      description: `Update the specified ${typeName} Validation Rule.`,
      params: z.object({
        ruleId: z.string().uuid().describe(SecretValidationRules.UPDATE(type).ruleId)
      }),
      body: updateSchema,
      response: { 200: z.object({ secretValidationRule: responseSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const secretValidationRule = (await server.services.secretValidationRule.updateSecretValidationRule(
        { ...req.body, ruleId: req.params.ruleId, type },
        req.permission
      )) as T;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: secretValidationRule.projectId,
        event: {
          type: EventType.SECRET_VALIDATION_RULE_UPDATE,
          metadata: {
            ruleId: secretValidationRule.id,
            name: secretValidationRule.name,
            type,
            environmentSlug: secretValidationRule.environment?.slug ?? null,
            secretPath: secretValidationRule.secretPath,
            isActive: secretValidationRule.isActive
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.SecretValidationRuleUpdated,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: { ruleId: secretValidationRule.id, projectId: secretValidationRule.projectId, type }
        })
        .catch(() => {});

      return { secretValidationRule };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:ruleId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: `delete${opId}ValidationRule`,
      tags: [ApiDocsTags.SecretValidationRules],
      description: `Delete the specified ${typeName} Validation Rule.`,
      params: z.object({
        ruleId: z.string().uuid().describe(SecretValidationRules.DELETE(type).ruleId)
      }),
      response: { 200: z.object({ secretValidationRule: responseSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const secretValidationRule = (await server.services.secretValidationRule.deleteSecretValidationRule(
        { ruleId: req.params.ruleId, type },
        req.permission
      )) as T;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: secretValidationRule.projectId,
        event: {
          type: EventType.SECRET_VALIDATION_RULE_DELETE,
          metadata: { ruleId: secretValidationRule.id, name: secretValidationRule.name, type }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.SecretValidationRuleDeleted,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: { ruleId: secretValidationRule.id, projectId: secretValidationRule.projectId, type }
        })
        .catch(() => {});

      return { secretValidationRule };
    }
  });
};
