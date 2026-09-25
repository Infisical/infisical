import {
  AgentVaultActivityLoggingCorsProbeResponseSchema,
  AgentVaultActivityLoggingHealthResponseSchema,
  AgentVaultActivityLoggingSettingsResponseSchema,
  AgentVaultActivityLoggingSettingsUpdateSchema
} from "@app/ee/services/agent-vault-activity/agent-vault-activity-schemas";
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
    url: "/activity-logging",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "getAgentVaultActivityLoggingSettings",
      description: "Gets the session logging settings",
      tags: [ApiDocsTags.AgentVaultSettings],
      response: { 200: AgentVaultActivityLoggingSettingsResponseSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) =>
      server.services.agentVaultActivity.getActivityLoggingSettings({
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
    url: "/activity-logging",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "updateAgentVaultActivityLoggingSettings",
      description:
        "Updates the session logging settings. If session logging is on, Infisical checks that the AWS connection can reach the bucket and write to it before saving.",
      tags: [ApiDocsTags.AgentVaultSettings],
      body: AgentVaultActivityLoggingSettingsUpdateSchema,
      response: { 200: AgentVaultActivityLoggingSettingsResponseSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { settings, relocated, appConnectionName } =
        await server.services.agentVaultActivity.updateActivityLoggingSettings({
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
          type: EventType.AGENT_VAULT_ACTIVITY_LOGGING_SETTINGS_UPDATE,
          metadata: { ...settings, appConnectionName, relocated }
        }
      });

      emitAgentVaultTelemetry(server.services.telemetry, req, {
        event: PostHogEventTypes.AgentVaultActivityConfigUpdated,
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
    url: "/activity-logging/health",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "getAgentVaultActivityLoggingHealth",
      description:
        "Gets whether session logging has reached its storage limit, and whether Infisical can use the AWS connection",
      tags: [ApiDocsTags.AgentVaultSettings],
      response: { 200: AgentVaultActivityLoggingHealthResponseSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req, reply) => {
      addNoCacheHeaders(reply);
      return server.services.agentVaultActivity.getActivityLoggingHealth({
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
    url: "/activity-logging/cors-probe",
    config: { rateLimit: readLimit },
    schema: {
      hide: true,
      operationId: "getAgentVaultActivityLoggingCorsProbe",
      description: "Gets a presigned URL for checking the bucket's CORS rule",
      tags: [ApiDocsTags.AgentVaultSettings],
      response: { 200: AgentVaultActivityLoggingCorsProbeResponseSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req, reply) => {
      addNoCacheHeaders(reply);
      return server.services.agentVaultActivity.getActivityLoggingCorsProbe({
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
