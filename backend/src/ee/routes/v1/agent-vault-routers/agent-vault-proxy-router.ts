import { FastifyRequest } from "fastify";
import { z } from "zod";

import { TAgentVaultActorContext } from "@app/ee/services/agent-vault/agent-vault-actor-types";
import { AgentVaultUnmatchedHost } from "@app/ee/services/agent-vault/agent-vault-enums";
import { hostPatternSchema } from "@app/ee/services/agent-vault/agent-vault-host-pattern";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { AGENT_VAULT } from "@app/lib/api-docs";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const actorContext = (req: FastifyRequest): TAgentVaultActorContext => ({
  actorId: req.permission.id,
  actor: req.permission.type,
  actorOrgId: req.permission.orgId,
  actorAuthMethod: req.permission.authMethod
});

// What every member sees. bypassHosts and unmatchedHost describe the deployment rather than the session,
// so they are added only for an administrator — one `read` action, the service decides the shape.
const ProxyMemberViewSchema = z.object({
  id: z.string().uuid().describe(AGENT_VAULT.PROXY.proxyId),
  name: z.string().describe(AGENT_VAULT.PROXY.name),
  heartbeat: z.date().nullable().describe(AGENT_VAULT.PROXY.heartbeat),
  isHealthy: z.boolean().describe(AGENT_VAULT.PROXY.isHealthy),
  version: z.string().nullable().describe(AGENT_VAULT.PROXY.version),
  rootCaFingerprint: z.string().nullable().describe(AGENT_VAULT.PROXY.rootCaFingerprint),
  rootCaExpiresAt: z.date().nullable().describe(AGENT_VAULT.PROXY.rootCaExpiresAt)
});

const ProxyAdminViewSchema = ProxyMemberViewSchema.extend({
  unmatchedHost: z.nativeEnum(AgentVaultUnmatchedHost).describe(AGENT_VAULT.PROXY.unmatchedHost),
  bypassHosts: z.string().nullable().describe(AGENT_VAULT.PROXY.bypassHosts),
  pollInterval: z.number().describe(AGENT_VAULT.PROXY.pollInterval),
  createdAt: z.date()
});

const EnrollmentSchema = z.object({
  // Shown once, single-use, and its row is deleted in-transaction when the proxy enrolls.
  token: z.string().describe(AGENT_VAULT.PROXY.enrollmentToken),
  expiresAt: z.date()
});

const ProxySettingsSchema = {
  unmatchedHost: z.nativeEnum(AgentVaultUnmatchedHost).describe(AGENT_VAULT.PROXY.unmatchedHost),
  // Evaluated first, at CONNECT, before any interception: no certificate minted, no credential injected.
  bypassHosts: hostPatternSchema.nullable().describe(AGENT_VAULT.PROXY.bypassHosts),
  pollInterval: z.number().int().min(10).max(300).describe(AGENT_VAULT.PROXY.pollInterval)
};

export const registerAgentVaultProxyRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "listAgentVaultProxies",
      description: "List the organization's Agent Vault proxies",
      tags: [ApiDocsTags.AgentVaultProxies],
      response: { 200: z.object({ proxies: z.union([ProxyAdminViewSchema, ProxyMemberViewSchema]).array() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const proxies = await server.services.agentVaultProxy.listProxies({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req)
      });
      return { proxies };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "createAgentVaultProxy",
      description: "Register an Agent Vault proxy and issue its one-time enrollment token",
      tags: [ApiDocsTags.AgentVaultProxies],
      body: z.object({
        name: slugSchema({ max: 64, field: "Name" }).describe(AGENT_VAULT.PROXY.name),
        unmatchedHost: ProxySettingsSchema.unmatchedHost.optional(),
        bypassHosts: ProxySettingsSchema.bypassHosts.optional(),
        pollInterval: ProxySettingsSchema.pollInterval.optional()
      }),
      response: { 200: z.object({ proxy: ProxyAdminViewSchema, enrollment: EnrollmentSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { proxy, enrollment } = await server.services.agentVaultProxy.createProxy({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_PROXY_REGISTER,
          metadata: { proxyId: proxy.id, name: proxy.name }
        }
      });

      return { proxy, enrollment };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:proxyId",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "updateAgentVaultProxy",
      description: "Update an Agent Vault proxy's name or settings",
      tags: [ApiDocsTags.AgentVaultProxies],
      params: z.object({ proxyId: z.string().uuid().describe(AGENT_VAULT.PROXY.proxyId) }),
      body: z.object({
        name: slugSchema({ max: 64, field: "Name" }).optional().describe(AGENT_VAULT.PROXY.name),
        unmatchedHost: ProxySettingsSchema.unmatchedHost.optional(),
        bypassHosts: ProxySettingsSchema.bypassHosts.optional(),
        pollInterval: ProxySettingsSchema.pollInterval.optional()
      }),
      response: { 200: z.object({ proxy: ProxyAdminViewSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const proxy = await server.services.agentVaultProxy.updateProxy({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        proxyId: req.params.proxyId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_PROXY_UPDATE,
          metadata: { proxyId: proxy.id, ...req.body }
        }
      });

      return { proxy };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:proxyId",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "deleteAgentVaultProxy",
      description: "Delete an Agent Vault proxy",
      tags: [ApiDocsTags.AgentVaultProxies],
      params: z.object({ proxyId: z.string().uuid().describe(AGENT_VAULT.PROXY.proxyId) }),
      response: { 200: z.object({ proxy: z.object({ id: z.string().uuid(), name: z.string() }) }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const proxy = await server.services.agentVaultProxy.deleteProxy({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        proxyId: req.params.proxyId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: { type: EventType.AGENT_VAULT_PROXY_DELETE, metadata: { proxyId: proxy.id, name: proxy.name } }
      });

      return { proxy };
    }
  });

  server.route({
    method: "POST",
    url: "/:proxyId/enrollment-token",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "reissueAgentVaultProxyEnrollmentToken",
      description: "Issue a replacement enrollment token for an Agent Vault proxy",
      tags: [ApiDocsTags.AgentVaultProxies],
      params: z.object({ proxyId: z.string().uuid().describe(AGENT_VAULT.PROXY.proxyId) }),
      response: { 200: z.object({ enrollment: EnrollmentSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      // Deliberately does not bump tokenVersion: the running proxy keeps serving until the replacement
      // enrolls, so reissuing a token is not an outage.
      const { proxy, enrollment } = await server.services.agentVaultProxy.reissueEnrollmentToken({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        proxyId: req.params.proxyId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_PROXY_TOKEN_REISSUE,
          metadata: { proxyId: proxy.id, name: proxy.name }
        }
      });

      return { enrollment };
    }
  });

  server.route({
    method: "POST",
    url: "/:proxyId/revoke",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "revokeAgentVaultProxyAccess",
      description: "Revoke an Agent Vault proxy's access token",
      tags: [ApiDocsTags.AgentVaultProxies],
      params: z.object({ proxyId: z.string().uuid().describe(AGENT_VAULT.PROXY.proxyId) }),
      response: { 200: z.object({ proxy: ProxyAdminViewSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const proxy = await server.services.agentVaultProxy.revokeProxyAccess({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        proxyId: req.params.proxyId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_PROXY_REVOKE,
          metadata: { proxyId: proxy.id, name: proxy.name }
        }
      });

      return { proxy };
    }
  });
};
