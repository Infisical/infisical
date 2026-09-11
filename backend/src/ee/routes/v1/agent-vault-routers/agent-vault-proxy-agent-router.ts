import { z } from "zod";

import { AgentVaultUnmatchedHost } from "@app/ee/services/agent-vault/agent-vault-enums";
import { AGENT_VAULT_SESSION_TOKEN_PREFIX } from "@app/ee/services/agent-vault-session/agent-vault-session-fns";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ResourceAuthMethodType } from "@app/ee/services/resource-auth-method/resource-auth-method-fns";
import { AGENT_VAULT } from "@app/lib/api-docs";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { logger } from "@app/lib/logger";
import { agentVaultHeartbeatLimit, agentVaultResolveLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";

const ProxyConfigSchema = z.object({
  unmatchedHost: z.nativeEnum(AgentVaultUnmatchedHost).describe(AGENT_VAULT.PROXY.unmatchedHost),
  bypassHosts: z.string().nullable().describe(AGENT_VAULT.PROXY.bypassHosts),
  pollInterval: z.number().describe(AGENT_VAULT.PROXY.pollInterval)
});

const SESSION_HEADER = "x-infisical-agent-session";

export const registerAgentVaultProxyAgentRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/login",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "loginAgentVaultProxy",
      description:
        "Proxy login. Body discriminates on `method`; token exchanges a one-time enrollment token for the proxy's access token.",
      tags: [ApiDocsTags.AgentVaultProxies],
      body: z.discriminatedUnion("method", [
        z.object({
          method: z.literal(ResourceAuthMethodType.Token),
          token: z.string().trim().min(1).max(256).describe(AGENT_VAULT.PROXY.enrollmentToken),
          rootCaCertificate: z.string().trim().min(1).max(16384).describe(AGENT_VAULT.PROXY.rootCaCertificate)
        })
      ]),
      response: {
        200: z.object({
          proxyId: z.string().uuid().describe(AGENT_VAULT.PROXY.proxyId),
          name: z.string().describe(AGENT_VAULT.PROXY.name),
          accessToken: z.string(),
          config: ProxyConfigSchema
        })
      }
    },
    handler: async (req) => {
      const result = await server.services.agentVaultProxy.enroll({
        enrollmentToken: req.body.token,
        rootCaCertificate: req.body.rootCaCertificate
      });

      // The enrollment token is already consumed and this response is the only copy of the access token,
      // so an audit failure must not fail the request.
      try {
        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          actor: { type: ActorType.AGENT_VAULT_PROXY, metadata: { agentVaultProxyId: result.proxyId } },
          orgId: result.orgId,
          projectId: result.projectId,
          event: {
            type: EventType.AGENT_VAULT_PROXY_ENROLL,
            metadata: {
              proxyId: result.proxyId,
              name: result.name,
              rootCaFingerprint: result.rootCaFingerprint,
              replacedExistingCa: result.replacedExistingCa
            }
          }
        });
      } catch (error) {
        logger.error(
          error,
          `agentVaultProxyEnroll: failed to write the enrollment audit log [proxyId=${result.proxyId}]`
        );
      }

      return {
        proxyId: result.proxyId,
        name: result.name,
        accessToken: result.accessToken,
        config: result.config
      };
    }
  });

  server.route({
    method: "POST",
    url: "/heartbeat",
    config: { rateLimit: agentVaultHeartbeatLimit },
    schema: {
      operationId: "agentVaultProxyHeartbeat",
      description: "Report a proxy as alive and read back its settings",
      tags: [ApiDocsTags.AgentVaultProxies],
      response: { 200: z.object({ config: ProxyConfigSchema }) }
    },
    onRequest: verifyAuth([AuthMode.AGENT_VAULT_PROXY_ACCESS_TOKEN]),
    handler: async (req) => server.services.agentVaultProxy.heartbeat({ proxyId: req.permission.id })
  });

  server.route({
    method: "POST",
    url: "/resolve",
    config: { rateLimit: agentVaultResolveLimit },
    schema: {
      operationId: "resolveAgentVaultSession",
      description: "Resolve a session into the services and credentials the proxy should attach",
      tags: [ApiDocsTags.AgentVaultProxies],
      headers: z
        .object({
          [SESSION_HEADER]: z
            .string()
            .trim()
            .min(1)
            .max(128)
            .startsWith(AGENT_VAULT_SESSION_TOKEN_PREFIX)
            .describe(AGENT_VAULT.PROXY.sessionToken)
        })
        .passthrough(),
      response: {
        200: z.object({
          sessionId: z.string().uuid(),
          expiresAt: z.date().nullable(),
          services: z
            .object({
              id: z.string().uuid(),
              name: z.string(),
              accessBundleName: z.string(),
              hostPattern: z.string(),
              credential: z.discriminatedUnion("type", [
                z.object({
                  type: z.literal("bearer"),
                  headerName: z.string(),
                  headerPrefix: z.string(),
                  value: z.string()
                }),
                z.object({ type: z.literal("basic"), username: z.string(), password: z.string() }),
                z.object({ type: z.literal("passthrough") })
              ])
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.AGENT_VAULT_PROXY_ACCESS_TOKEN]),
    handler: async (req) => {
      // Deliberately unaudited: one row per poll per session is ~144k a day for a hundred sessions.
      return server.services.agentVaultProxy.resolveSession({
        proxyId: req.permission.id,
        orgId: req.permission.orgId,
        sessionToken: req.headers[SESSION_HEADER]
      });
    }
  });
};
