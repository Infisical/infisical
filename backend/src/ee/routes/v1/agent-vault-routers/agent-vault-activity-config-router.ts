import {
  AgentVaultActivityConfigResponseSchema,
  AgentVaultActivityConfigUpdateSchema
} from "@app/ee/services/agent-vault-activity/agent-vault-activity-schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { emitAgentVaultTelemetry } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

export const registerAgentVaultActivityConfigRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/config",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "getAgentVaultActivityConfig",
      description: "Read where this project's session activity is stored, and how much of the limit it uses",
      tags: [ApiDocsTags.AgentVaultActivity],
      response: { 200: AgentVaultActivityConfigResponseSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) =>
      server.services.agentVaultActivity.getActivityConfig({
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
    url: "/config",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "updateAgentVaultActivityConfig",
      description:
        "Point this project's session activity at an S3 bucket, or turn logging on and off. The bucket is checked for reachability and write access before the change is saved.",
      tags: [ApiDocsTags.AgentVaultActivity],
      body: AgentVaultActivityConfigUpdateSchema,
      response: { 200: AgentVaultActivityConfigResponseSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { relocated, ...result } = await server.services.agentVaultActivity.updateActivityConfig({
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
          type: EventType.AGENT_VAULT_ACTIVITY_CONFIG_UPDATE,
          metadata: { ...result.config, relocated }
        }
      });

      emitAgentVaultTelemetry(server.services.telemetry, req, {
        event: PostHogEventTypes.AgentVaultActivityConfigUpdated,
        properties: {
          enabled: result.config.enabled,
          hasDestination: Boolean(result.config.bucket),
          relocated
        }
      });

      return result;
    }
  });
};
