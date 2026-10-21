import { z } from "zod";

import { AgentVaultVariableScope } from "@app/ee/services/agent-vault/agent-vault-enums";
import { AGENT_VAULT_VARIABLE_KEY_MAX_LENGTH } from "@app/ee/services/agent-vault/agent-vault-variable-fns";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { AGENT_VAULT } from "@app/lib/api-docs";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { readLimit, secretsLimit, writeLimit } from "@app/server/config/rateLimiter";
import { addNoCacheHeaders } from "@app/server/lib/caching";
import { emitAgentVaultTelemetry } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { actorContext } from "./agent-vault-router-fns";
import {
  agentVaultListQuery,
  AgentVaultVariableKeySchema,
  AgentVaultVariableSchema,
  AgentVaultVariableValueSchema
} from "./agent-vault-schemas";

const AGENT_VAULT_LIST_MAX_KEYS = 100;

export const registerAgentVaultVariableRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listAgentVaultVariables",
      description:
        "List the Agent Vault variables you can see: your own personal ones, and the global ones if you're an admin",
      tags: [ApiDocsTags.AgentVaultVariables],
      querystring: z.object({
        scope: z.nativeEnum(AgentVaultVariableScope).optional().describe(AGENT_VAULT.VARIABLE.listScope),
        orderBy: z.enum(["key", "serviceCount"]).default("key").describe(AGENT_VAULT.VARIABLE.orderBy),
        orderDirection: z.enum(["asc", "desc"]).default("asc").describe(AGENT_VAULT.VARIABLE.orderDirection),
        keys: z
          .string()
          .max(AGENT_VAULT_LIST_MAX_KEYS * (AGENT_VAULT_VARIABLE_KEY_MAX_LENGTH + 1))
          // Empty entries, as from a trailing comma, are dropped rather than refused.
          .transform((val) => [...new Set(val.split(",").map((key) => key.trim()))].filter(Boolean))
          .pipe(AgentVaultVariableKeySchema.array().min(1).max(AGENT_VAULT_LIST_MAX_KEYS))
          .optional()
          .describe(AGENT_VAULT.VARIABLE.keys),
        ...agentVaultListQuery(AGENT_VAULT.VARIABLE),
        // No default here: the service defaults it to the number of keys for a lookup, and to 20 otherwise.
        limit: z.coerce.number().int().min(1).max(100).optional().describe(AGENT_VAULT.VARIABLE.limit)
      }),
      response: {
        200: z.object({
          variables: AgentVaultVariableSchema.array(),
          totalCount: z.number().describe(AGENT_VAULT.VARIABLE.totalCount)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) =>
      server.services.agentVaultVariable.listVariables({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        ...req.query
      })
  });

  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "createAgentVaultVariable",
      description: "Create a global variable, or a personal one of your own",
      tags: [ApiDocsTags.AgentVaultVariables],
      body: z.object({
        scope: z.nativeEnum(AgentVaultVariableScope).describe(AGENT_VAULT.VARIABLE.createScope),
        key: AgentVaultVariableKeySchema.describe(AGENT_VAULT.VARIABLE.key),
        value: AgentVaultVariableValueSchema.describe(AGENT_VAULT.VARIABLE.value)
      }),
      response: { 200: z.object({ variable: AgentVaultVariableSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { variable } = await server.services.agentVaultVariable.createVariable({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_VARIABLE_CREATE,
          metadata: { variableId: variable.id, key: variable.key, scope: variable.scope }
        }
      });

      emitAgentVaultTelemetry(server.services.telemetry, req, {
        event: PostHogEventTypes.AgentVaultVariableCreated,
        properties: { variableId: variable.id, scope: variable.scope }
      });

      return { variable };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:variableId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "updateAgentVaultVariable",
      description: "Update a global variable, or a personal one of your own",
      tags: [ApiDocsTags.AgentVaultVariables],
      params: z.object({
        variableId: z.string().uuid().describe(AGENT_VAULT.VARIABLE.variableId)
      }),
      body: z
        .object({
          key: AgentVaultVariableKeySchema.optional().describe(AGENT_VAULT.VARIABLE.key),
          value: AgentVaultVariableValueSchema.optional().describe(AGENT_VAULT.VARIABLE.updateValue)
        })
        .refine(
          (body) => Object.values(body).some((value) => value !== undefined),
          "Provide 'key', 'value' or both to update"
        ),
      response: { 200: z.object({ variable: AgentVaultVariableSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { variable, previousKey } = await server.services.agentVaultVariable.updateVariable({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        variableId: req.params.variableId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_VARIABLE_UPDATE,
          metadata: {
            variableId: variable.id,
            key: variable.key,
            scope: variable.scope,
            previousKey: previousKey === variable.key ? undefined : previousKey,
            valueReplaced: req.body.value !== undefined
          }
        }
      });

      emitAgentVaultTelemetry(server.services.telemetry, req, {
        event: PostHogEventTypes.AgentVaultVariableUpdated,
        properties: {
          variableId: variable.id,
          scope: variable.scope,
          keyChanged: previousKey !== variable.key,
          valueReplaced: req.body.value !== undefined,
          usedByServiceCount: variable.usedByServices.length
        }
      });

      return { variable };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:variableId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "deleteAgentVaultVariable",
      description:
        "Delete a global variable, or a personal one of your own. A variable in use, by a service or by your personal values, can't be deleted.",
      tags: [ApiDocsTags.AgentVaultVariables],
      params: z.object({
        variableId: z.string().uuid().describe(AGENT_VAULT.VARIABLE.variableId)
      }),
      response: { 200: z.object({ variable: AgentVaultVariableSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { variable } = await server.services.agentVaultVariable.deleteVariable({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        variableId: req.params.variableId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_VARIABLE_DELETE,
          metadata: { variableId: variable.id, key: variable.key, scope: variable.scope }
        }
      });

      emitAgentVaultTelemetry(server.services.telemetry, req, {
        event: PostHogEventTypes.AgentVaultVariableDeleted,
        properties: { variableId: variable.id, scope: variable.scope }
      });

      return { variable };
    }
  });

  server.route({
    method: "GET",
    url: "/:variableId/value",
    config: { rateLimit: secretsLimit },
    schema: {
      hide: false,
      operationId: "getAgentVaultVariableValue",
      description: "Get the value of a global variable, or a personal one of your own",
      tags: [ApiDocsTags.AgentVaultVariables],
      params: z.object({
        variableId: z.string().uuid().describe(AGENT_VAULT.VARIABLE.variableId)
      }),
      response: { 200: z.object({ value: z.string().describe(AGENT_VAULT.VARIABLE.revealedValue) }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req, reply) => {
      const { variable, value } = await server.services.agentVaultVariable.getVariableValue({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        variableId: req.params.variableId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_VARIABLE_VALUE_VIEW,
          metadata: { variableId: variable.id, key: variable.key, scope: variable.scope }
        }
      });

      addNoCacheHeaders(reply);
      return { value };
    }
  });
};
