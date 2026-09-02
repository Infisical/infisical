import { z } from "zod";

import { AgentVaultUnmatchedHost } from "@app/ee/services/agent-vault/agent-vault-enums";
import { AGENT_VAULT_SESSION_TOKEN_PREFIX } from "@app/ee/services/agent-vault-session/agent-vault-session-fns";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { AGENT_VAULT } from "@app/lib/api-docs";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { logger } from "@app/lib/logger";
import { agentVaultHeartbeatLimit, agentVaultResolveLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const ProxyConfigSchema = z.object({
  unmatchedHost: z.nativeEnum(AgentVaultUnmatchedHost).describe(AGENT_VAULT.PROXY.unmatchedHost),
  bypassHosts: z.string().nullable().describe(AGENT_VAULT.PROXY.bypassHosts),
  pollInterval: z.number().describe(AGENT_VAULT.PROXY.pollInterval)
});

// The session token rides in a header, never a query string, so it stays out of access logs and
// referrers.
const SESSION_HEADER = "x-infisical-agent-session";

export const registerAgentVaultProxyAgentRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/enroll",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "enrollAgentVaultProxy",
      description: "Exchange a one-time enrollment token for a proxy access token",
      tags: [ApiDocsTags.AgentVaultProxies],
      body: z.object({
        enrollmentToken: z.string().trim().min(1).max(256).describe(AGENT_VAULT.PROXY.enrollmentToken),
        rootCaCertificate: z.string().trim().min(1).max(16384).describe(AGENT_VAULT.PROXY.rootCaCertificate)
      }),
      response: {
        200: z.object({
          proxyId: z.string().uuid().describe(AGENT_VAULT.PROXY.proxyId),
          name: z.string().describe(AGENT_VAULT.PROXY.name),
          // Non-expiring, revoked by bumping tokenVersion.
          accessToken: z.string(),
          config: ProxyConfigSchema
        })
      }
    },
    // The enrollment token is the credential, once. No AuthMode applies.
    handler: async (req) => {
      const result = await server.services.agentVaultProxy.enroll(req.body);

      // The enrollment token is single-use and consumed in-transaction by the time we get here, and this
      // response is the only copy of the access token. So an audit failure must not fail the request:
      // it would leave the proxy enrolled server-side with nobody holding its token, and the operator
      // re-running the same command would get a 401.
      try {
        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
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
      body: z.object({
        version: z.string().trim().max(32).optional().describe(AGENT_VAULT.PROXY.version)
      }),
      // The full settings block comes back every time, unconditionally.
      response: { 200: z.object({ config: ProxyConfigSchema }) }
    },
    onRequest: verifyAuth([AuthMode.AGENT_VAULT_PROXY_ACCESS_TOKEN]),
    handler: async (req) =>
      server.services.agentVaultProxy.heartbeat({
        proxyId: req.permission.id,
        version: req.body.version
      })
  });

  server.route({
    method: "POST",
    url: "/resolve",
    config: { rateLimit: agentVaultResolveLimit },
    schema: {
      operationId: "resolveAgentVaultSession",
      description: "Resolve a session into the connections and credentials the proxy should attach",
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
          // Ordered: bundle position, then connection name. An empty array is a valid session whose
          // actor has lost every bundle — not an error.
          connections: z
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
      const { audit, ...result } = await server.services.agentVaultProxy.resolveSession({
        proxyId: req.permission.id,
        orgId: req.permission.orgId,
        sessionToken: req.headers[SESSION_HEADER]
      });

      // Never one row per poll: at 60s a hundred active sessions would write 144k rows a day into the
      // partitioned audit table and into every customer's audit stream. The service returns a non-null
      // audit hint only on the first resolve and whenever the connection set changes.
      if (audit) {
        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          orgId: req.permission.orgId,
          event: {
            type: EventType.AGENT_VAULT_SESSION_RESOLVE,
            metadata: {
              sessionId: result.sessionId,
              connectionCount: audit.connectionCount,
              isFirstResolve: audit.isFirstResolve
            }
          }
        });
      }

      return result;
    }
  });
};
