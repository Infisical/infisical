import {
  AgentVaultSessionLogCorsProbeResponseSchema,
  AgentVaultSessionLogHealthResponseSchema,
  AgentVaultSessionLogSettingsResponseSchema,
  AgentVaultSessionLogSettingsUpdateSchema
} from "@app/ee/services/agent-vault-session-log/agent-vault-session-log-schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { addNoCacheHeaders } from "@app/server/lib/caching";
import { emitAgentVaultTelemetry } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

export const registerAgentVaultSettingsRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/session-logs",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "getAgentVaultSessionLogSettings",
      description: "Gets the session log settings",
      tags: [ApiDocsTags.AgentVaultSettings],
      response: { 200: AgentVaultSessionLogSettingsResponseSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) =>
      server.services.agentVaultSessionLog.getSessionLogSettings({
        projectId: req.internalAgentVaultProjectId,
        ctx: {
          actorId: req.permission.id,
          actor: req.permission.type,
          actorOrgId: req.permission.orgId,
          actorAuthMethod: req.permission.authMethod
        }
      })
  });

  server.route({
    method: "PATCH",
    url: "/session-logs",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "updateAgentVaultSessionLogSettings",
      description:
        "Updates the session log settings. If session logs are on, Infisical checks that the AWS connection can reach the bucket and write to it before saving.",
      tags: [ApiDocsTags.AgentVaultSettings],
      body: AgentVaultSessionLogSettingsUpdateSchema,
      response: { 200: AgentVaultSessionLogSettingsResponseSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { settings, relocated, appConnectionName } =
        await server.services.agentVaultSessionLog.updateSessionLogSettings({
          projectId: req.internalAgentVaultProjectId,
          ctx: {
            actorId: req.permission.id,
            actor: req.permission.type,
            actorOrgId: req.permission.orgId,
            actorAuthMethod: req.permission.authMethod
          },
          actor: {
            type: req.permission.type,
            id: req.permission.id,
            authMethod: req.permission.authMethod,
            orgId: req.permission.orgId,
            rootOrgId: req.permission.rootOrgId,
            parentOrgId: req.permission.parentOrgId
          },
          ...req.body
        });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_SESSION_LOG_SETTINGS_UPDATE,
          metadata: { ...settings, appConnectionName, relocated }
        }
      });

      emitAgentVaultTelemetry(server.services.telemetry, req, {
        event: PostHogEventTypes.AgentVaultSessionLogSettingsUpdated,
        properties: {
          enabled: settings.enabled,
          hasDestination: Boolean(settings.bucket),
          relocated
        }
      });

      return { settings };
    }
  });

  server.route({
    method: "GET",
    url: "/session-logs/health",
    config: { rateLimit: readLimit },
    schema: {
      hide: true,
      operationId: "getAgentVaultSessionLogHealth",
      description:
        "Gets whether session logs have reached their storage limit, and whether Infisical can use the AWS connection",
      tags: [ApiDocsTags.AgentVaultSettings],
      response: { 200: AgentVaultSessionLogHealthResponseSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req, reply) => {
      addNoCacheHeaders(reply);
      return server.services.agentVaultSessionLog.getSessionLogHealth({
        projectId: req.internalAgentVaultProjectId,
        ctx: {
          actorId: req.permission.id,
          actor: req.permission.type,
          actorOrgId: req.permission.orgId,
          actorAuthMethod: req.permission.authMethod
        }
      });
    }
  });

  server.route({
    method: "GET",
    url: "/session-logs/cors-probe",
    config: { rateLimit: readLimit },
    schema: {
      hide: true,
      operationId: "getAgentVaultSessionLogCorsProbe",
      description: "Gets a presigned URL for checking the bucket's CORS rule",
      tags: [ApiDocsTags.AgentVaultSettings],
      response: { 200: AgentVaultSessionLogCorsProbeResponseSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req, reply) => {
      addNoCacheHeaders(reply);
      return server.services.agentVaultSessionLog.getSessionLogCorsProbe({
        projectId: req.internalAgentVaultProjectId,
        ctx: {
          actorId: req.permission.id,
          actor: req.permission.type,
          actorOrgId: req.permission.orgId,
          actorAuthMethod: req.permission.authMethod
        }
      });
    }
  });
};
