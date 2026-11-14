import { z } from "zod";

import {
  AgentVaultSessionLogCorsProbeResponseSchema,
  AgentVaultSessionLogHealthResponseSchema,
  AgentVaultSessionLogSettingsResponseSchema,
  AgentVaultSessionLogSettingsUpdateSchema
} from "@app/ee/services/agent-vault-session-log/agent-vault-session-log-schemas";
import { buildSessionLogSettingsAuditMetadata } from "@app/ee/services/agent-vault-session-log/agent-vault-session-log-storage-fns";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { addNoCacheHeaders } from "@app/server/lib/caching";
import { emitAgentVaultTelemetry } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { actorContext, resolveRequestedProjectId } from "./agent-vault-router-fns";
import { AgentVaultProjectIdSchema } from "./agent-vault-schemas";

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
      querystring: z.object({ projectId: AgentVaultProjectIdSchema }),
      response: { 200: AgentVaultSessionLogSettingsResponseSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) =>
      server.services.agentVaultSessionLog.getSessionLogSettings({
        projectId: await resolveRequestedProjectId(req, req.query.projectId, "query"),
        ctx: actorContext(req)
      })
  });

  server.route({
    method: "PATCH",
    url: "/session-logs",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "updateAgentVaultSessionLogSettings",
      description: "Updates the session log settings",
      tags: [ApiDocsTags.AgentVaultSettings],
      querystring: z.object({ projectId: AgentVaultProjectIdSchema }),
      body: AgentVaultSessionLogSettingsUpdateSchema,
      response: { 200: AgentVaultSessionLogSettingsResponseSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const projectId = await resolveRequestedProjectId(req, req.query.projectId, "query");
      const { settings, defaultStorage, appConnectionName, previous } =
        await server.services.agentVaultSessionLog.updateSessionLogSettings({
          projectId,
          ctx: actorContext(req),
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

      const metadata = buildSessionLogSettingsAuditMetadata({ settings, appConnectionName, previous });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
        event: { type: EventType.AGENT_VAULT_SESSION_LOG_SETTINGS_UPDATE, metadata }
      });

      emitAgentVaultTelemetry(server.services.telemetry, req, {
        event: PostHogEventTypes.AgentVaultSessionLogSettingsUpdated,
        properties: { enabled: metadata.enabled, storageType: metadata.storageType }
      });

      return { settings, defaultStorage };
    }
  });

  server.route({
    method: "GET",
    url: "/session-logs/health",
    config: { rateLimit: readLimit },
    schema: {
      hide: true,
      operationId: "getAgentVaultSessionLogHealth",
      description: "Gets whether Infisical can use the AWS connection for session logs",
      tags: [ApiDocsTags.AgentVaultSettings],
      querystring: z.object({ projectId: AgentVaultProjectIdSchema }),
      response: { 200: AgentVaultSessionLogHealthResponseSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req, reply) => {
      addNoCacheHeaders(reply);
      return server.services.agentVaultSessionLog.getSessionLogHealth({
        projectId: await resolveRequestedProjectId(req, req.query.projectId, "query"),
        ctx: actorContext(req)
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
      querystring: z.object({ projectId: AgentVaultProjectIdSchema }),
      response: { 200: AgentVaultSessionLogCorsProbeResponseSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req, reply) => {
      addNoCacheHeaders(reply);
      return server.services.agentVaultSessionLog.getSessionLogCorsProbe({
        projectId: await resolveRequestedProjectId(req, req.query.projectId, "query"),
        ctx: actorContext(req)
      });
    }
  });
};
