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
      description: "Read where this project's session activity is stored, and whether activity logging is on",
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
        "Point this project's session activity at an S3 bucket, or turn logging on and off. The bucket is checked for reachability and write access before the change is saved.",
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
        "Check whether activity logging is working: whether it has reached its storage limit, and whether Infisical can use its AWS connection",
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
      description: "Get a short-lived link the browser fetches to check that the bucket allows cross-origin reads",
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
