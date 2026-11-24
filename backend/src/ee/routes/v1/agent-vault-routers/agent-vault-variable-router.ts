import { z } from "zod";

import { AgentVaultVariableScope, AgentVaultVariableType } from "@app/ee/services/agent-vault/agent-vault-enums";
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

import {
  actorContext,
  recordOauthVariableConnected,
  resolveRequestedProjectId,
  variableAuditFieldsOf
} from "./agent-vault-router-fns";
import {
  AgentVaultCreateVariableBodySchema,
  agentVaultListQuery,
  AgentVaultOauthVariableCompleteSchema,
  AgentVaultOauthVariableSignInBodySchema,
  AgentVaultOauthVariableSignInStartSchema,
  AgentVaultProjectIdSchema,
  AgentVaultUpdateVariableBodySchema,
  AgentVaultVariableKeySchema,
  AgentVaultVariableSchema
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
        projectId: AgentVaultProjectIdSchema,
        scope: z.nativeEnum(AgentVaultVariableScope).optional().describe(AGENT_VAULT.VARIABLE.listScope),
        type: z.nativeEnum(AgentVaultVariableType).optional().describe(AGENT_VAULT.VARIABLE.typeFilter),
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
    handler: async (req) => {
      const { projectId: requestedProjectId, ...query } = req.query;
      const projectId = await resolveRequestedProjectId(req, requestedProjectId, "query");
      return server.services.agentVaultVariable.listVariables({
        projectId,
        ctx: actorContext(req),
        ...query
      });
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "createAgentVaultVariable",
      description:
        "Create a global variable, or a personal one of your own. An OAuth variable is always global and starts out not connected, unless it is created with `tokens`. Send `signIn` to also start a sign-in.",
      tags: [ApiDocsTags.AgentVaultVariables],
      body: AgentVaultCreateVariableBodySchema,
      response: {
        200: z.object({
          variable: AgentVaultVariableSchema,
          signIn: AgentVaultOauthVariableSignInStartSchema.nullable().describe(AGENT_VAULT.VARIABLE.signInStart),
          signInError: z.string().optional().describe(AGENT_VAULT.VARIABLE.signInError)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { projectId: requestedProjectId, ...body } = req.body;
      const projectId = await resolveRequestedProjectId(req, requestedProjectId, "body");
      const { variable, connected, signIn, signInError } = await server.services.agentVaultVariable.createVariable({
        projectId,
        ctx: actorContext(req),
        ...body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
        event: {
          type: EventType.AGENT_VAULT_VARIABLE_CREATE,
          metadata: {
            variableId: variable.id,
            key: variable.key,
            scope: variable.scope,
            ...variableAuditFieldsOf(variable)
          }
        }
      });

      emitAgentVaultTelemetry(server.services.telemetry, req, {
        event: PostHogEventTypes.AgentVaultVariableCreated,
        properties: { variableId: variable.id, scope: variable.scope, type: variable.type }
      });

      if (connected) await recordOauthVariableConnected(req, projectId, connected);

      return { variable, signIn, ...(signInError ? { signInError } : {}) };
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
      body: AgentVaultUpdateVariableBodySchema,
      response: { 200: z.object({ variable: AgentVaultVariableSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const projectId = await server.services.agentVaultProjectResolver.resolveFromVariable(
        actorContext(req),
        req.params.variableId
      );
      const { variable, previousKey, valueReplaced, connected } =
        await server.services.agentVaultVariable.updateVariable({
          projectId,
          ctx: actorContext(req),
          variableId: req.params.variableId,
          ...req.body
        });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
        event: {
          type: EventType.AGENT_VAULT_VARIABLE_UPDATE,
          metadata: {
            variableId: variable.id,
            key: variable.key,
            scope: variable.scope,
            ...variableAuditFieldsOf(variable),
            previousKey: previousKey === variable.key ? undefined : previousKey,
            valueReplaced
          }
        }
      });

      emitAgentVaultTelemetry(server.services.telemetry, req, {
        event: PostHogEventTypes.AgentVaultVariableUpdated,
        properties: {
          variableId: variable.id,
          scope: variable.scope,
          keyChanged: previousKey !== variable.key,
          valueReplaced,
          usedByServiceCount: variable.usedByServices.length
        }
      });

      if (connected) await recordOauthVariableConnected(req, projectId, connected);

      return { variable };
    }
  });

  // A sign-in link for an OAuth variable, for a user of the caller's own app who never sees Infisical. The provider
  // redirects them to the variable's redirectUri (or Infisical's callback page), and the callback completes it below.
  server.route({
    method: "POST",
    url: "/:variableId/authorizations",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "createAgentVaultVariableAuthorization",
      description:
        "Start a sign-in for an OAuth variable and get the link to send the user to. The link works for 10 minutes, and only the caller who made it can complete it. When the variable needs more settings first, `authorization` is null and the response says which.",
      tags: [ApiDocsTags.AgentVaultVariables],
      params: z.object({
        variableId: z.string().uuid().describe(AGENT_VAULT.VARIABLE.variableId)
      }),
      // A POST with no body reaches here as null, not undefined, so optional() alone would refuse it.
      body: AgentVaultOauthVariableSignInBodySchema.nullish(),
      response: { 200: AgentVaultOauthVariableSignInStartSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const projectId = await server.services.agentVaultProjectResolver.resolveFromVariable(
        actorContext(req),
        req.params.variableId
      );
      return server.services.agentVaultOauth.startVariableAuthorization({
        projectId,
        ctx: actorContext(req),
        variableId: req.params.variableId,
        ...(req.body ?? {})
      });
    }
  });

  // An action sub-resource rather than a PATCH of the variable: completing exchanges a one-time code with the provider,
  // and the caller's callback only knows what the redirect carried. The state names the sign-in.
  server.route({
    method: "POST",
    url: "/:variableId/authorizations/complete",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "completeAgentVaultVariableAuthorization",
      description:
        "Finish a sign-in for an OAuth variable with what the provider's redirect carried, and store its tokens on the variable. Only the caller who started the sign-in can finish it. Completing one that already finished returns the variable again. A provider refusal or a mismatch is a 400 with the reason, a missing or expired sign-in a 404, and a sign-in being completed, or for settings changed since it started, a 409.",
      tags: [ApiDocsTags.AgentVaultVariables],
      params: z.object({
        variableId: z.string().uuid().describe(AGENT_VAULT.VARIABLE.variableId)
      }),
      body: AgentVaultOauthVariableCompleteSchema,
      response: { 200: z.object({ variable: AgentVaultVariableSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const projectId = await server.services.agentVaultProjectResolver.resolveFromVariable(
        actorContext(req),
        req.params.variableId
      );
      const { variableConnected } = await server.services.agentVaultOauth.completeVariableAuthorization({
        projectId,
        ctx: actorContext(req),
        variableId: req.params.variableId,
        ...req.body
      });
      if (variableConnected) await recordOauthVariableConnected(req, projectId, variableConnected);

      return server.services.agentVaultVariable.getVariable({
        projectId,
        ctx: actorContext(req),
        variableId: req.params.variableId
      });
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
      const projectId = await server.services.agentVaultProjectResolver.resolveFromVariable(
        actorContext(req),
        req.params.variableId
      );
      const { variable } = await server.services.agentVaultVariable.deleteVariable({
        projectId,
        ctx: actorContext(req),
        variableId: req.params.variableId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
        event: {
          type: EventType.AGENT_VAULT_VARIABLE_DELETE,
          metadata: {
            variableId: variable.id,
            key: variable.key,
            scope: variable.scope,
            ...variableAuditFieldsOf(variable)
          }
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
      description:
        "Get the value of a global text variable, or a personal one of your own. An OAuth variable's tokens are never returned, so asking for one is a 400.",
      tags: [ApiDocsTags.AgentVaultVariables],
      params: z.object({
        variableId: z.string().uuid().describe(AGENT_VAULT.VARIABLE.variableId)
      }),
      response: { 200: z.object({ value: z.string().describe(AGENT_VAULT.VARIABLE.revealedValue) }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req, reply) => {
      const projectId = await server.services.agentVaultProjectResolver.resolveFromVariable(
        actorContext(req),
        req.params.variableId
      );
      const { variable, value } = await server.services.agentVaultVariable.getVariableValue({
        projectId,
        ctx: actorContext(req),
        variableId: req.params.variableId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
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
