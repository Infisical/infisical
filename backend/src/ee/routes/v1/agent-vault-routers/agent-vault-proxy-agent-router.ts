import RE2 from "re2";
import { z } from "zod";

import {
  AgentVaultOauthStatus,
  AgentVaultServiceType,
  AgentVaultTrafficPolicy
} from "@app/ee/services/agent-vault/agent-vault-enums";
import {
  MAX_OAUTH_SCOPE_LENGTH,
  OAUTH_SCOPE_TOKEN_PATTERN
} from "@app/ee/services/agent-vault-oauth/agent-vault-oauth-discovery-fns";
import { AGENT_VAULT_SESSION_TOKEN_PREFIX } from "@app/ee/services/agent-vault-session/agent-vault-session-fns";
import {
  AgentVaultSessionLogChunkCreateResponseSchema,
  AgentVaultSessionLogChunkCreateSchema
} from "@app/ee/services/agent-vault-session-log/agent-vault-session-log-schemas";
import { EventType, UserAgentType } from "@app/ee/services/audit-log/audit-log-types";
import { ResourceAuthMethodType } from "@app/ee/services/resource-auth-method/resource-auth-method-fns";
import { AGENT_VAULT } from "@app/lib/api-docs";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { logger } from "@app/lib/logger";
import {
  agentVaultCredentialRefreshLimit,
  agentVaultHeartbeatLimit,
  agentVaultResolveLimit,
  agentVaultSessionLogChunkLimit,
  writeLimit
} from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { AgentVaultHostPatternSchema } from "./agent-vault-schemas";

const ProxyConfigSchema = z.object({
  trafficPolicy: z.nativeEnum(AgentVaultTrafficPolicy).describe(AGENT_VAULT.PROXY.trafficPolicy),
  allowedHosts: z.string().nullable().describe(AGENT_VAULT.PROXY.allowedHosts),
  pollInterval: z.number().describe(AGENT_VAULT.PROXY.pollInterval)
});

const SESSION_HEADER = "x-infisical-agent-session";

const SessionHeaderSchema = z
  .object({
    [SESSION_HEADER]: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .startsWith(AGENT_VAULT_SESSION_TOKEN_PREFIX)
      .describe(AGENT_VAULT.PROXY.sessionToken)
  })
  .passthrough();

// `source` and `expiresAt` are only on an OAuth credential. A proxy that predates them injects it as any bearer.
const ResolvedBearerCredentialSchema = z
  .object({
    type: z.literal("bearer").describe(AGENT_VAULT.CREDENTIAL_REFRESH.credentialType),
    headerName: z.string().describe(AGENT_VAULT.SERVICE.headerName),
    headerPrefix: z.string().describe(AGENT_VAULT.SERVICE.headerPrefix),
    value: z.string().describe(AGENT_VAULT.CREDENTIAL_REFRESH.value),
    source: z.literal("oauth").optional().describe(AGENT_VAULT.CREDENTIAL_REFRESH.source),
    expiresAt: z.string().nullable().optional().describe(AGENT_VAULT.SERVICE.oauthExpiresAt)
  })
  .describe(JSON.stringify({ title: "Bearer" }));

export const registerAgentVaultProxyAgentRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/login",
    config: { rateLimit: writeLimit },
    schema: {
      hide: true,
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

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.AgentVaultProxyEnrolled,
          distinctId: `agent-vault-proxy-${result.proxyId}`,
          organizationId: result.orgId,
          anonymous: true,
          properties: {
            orgId: result.orgId,
            channel: req.auditLogInfo.userAgentType ?? UserAgentType.OTHER,
            proxyId: result.proxyId,
            replacedExistingCa: result.replacedExistingCa
          }
        })
        .catch(() => {});

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
      hide: true,
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
      hide: true,
      operationId: "resolveAgentVaultSession",
      description: "Resolve a session into the services and credentials the proxy should attach",
      tags: [ApiDocsTags.AgentVaultProxies],
      headers: SessionHeaderSchema,
      // Nullish, not optional: proxies predating session logs send no body, which arrives as null. They can't
      // record, so the handler counts them as already holding the key and never sends it.
      body: z
        .object({
          hasSessionLogKey: z.boolean().default(false).describe(AGENT_VAULT.SESSION_LOGS.hasSessionLogKey)
        })
        .nullish(),
      response: {
        200: z.object({
          sessionId: z.string().uuid(),
          expiresAt: z.date().nullable(),
          services: z
            .object({
              id: z.string().uuid(),
              name: z.string(),
              accessBundleName: z.string(),
              type: z.nativeEnum(AgentVaultServiceType).describe(AGENT_VAULT.SERVICE.type),
              hostPattern: z.string(),
              allowedMethods: z.string().array().nullable(),
              allowedPathPrefixes: z.string().array().nullable(),
              credential: z.discriminatedUnion("type", [
                ResolvedBearerCredentialSchema,
                z
                  .object({ type: z.literal("basic"), username: z.string(), password: z.string() })
                  .describe(JSON.stringify({ title: "Basic Auth" })),
                z.object({ type: z.literal("passthrough") }).describe(JSON.stringify({ title: "Pass-through" }))
              ]),
              customHeaders: z.object({ name: z.string(), prefix: z.string(), value: z.string() }).array(),
              substitutions: z
                .object({ placeholder: z.string(), surfaces: z.string().array(), value: z.string() })
                .array()
            })
            .array(),
          sessionLogs: z.object({
            enabled: z.boolean().describe(AGENT_VAULT.SESSION_LOGS.enabled),
            sessionKey: z.string().nullable().describe(AGENT_VAULT.SESSION_LOGS.proxySessionKey)
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.AGENT_VAULT_PROXY_ACCESS_TOKEN]),
    handler: async (req) => {
      // Deliberately unaudited: one row per poll per session is ~144k a day for a hundred sessions.
      return server.services.agentVaultProxy.resolveSession({
        proxyId: req.permission.id,
        orgId: req.permission.orgId,
        sessionToken: req.headers[SESSION_HEADER],
        hasSessionLogKey: req.body ? req.body.hasSessionLogKey : true
      });
    }
  });

  // An action sub-resource by choice: kept apart from resolve so it has its own rate limit.
  server.route({
    method: "POST",
    url: "/services/:serviceId/credential-refresh",
    config: { rateLimit: agentVaultCredentialRefreshLimit },
    schema: {
      hide: true,
      operationId: "refreshAgentVaultServiceCredential",
      description:
        "After the upstream rejected an OAuth token, return a fresh one. If the rejected token is no longer the current one, the current one is returned without calling the provider. A 409 means the service's host pattern no longer matches `hostPattern`, and no token is returned.",
      tags: [ApiDocsTags.AgentVaultProxies],
      headers: SessionHeaderSchema,
      params: z.object({ serviceId: z.string().uuid().describe(AGENT_VAULT.SERVICE.serviceId) }),
      body: z.object({
        hostPattern: AgentVaultHostPatternSchema.describe(AGENT_VAULT.CREDENTIAL_REFRESH.hostPattern),
        rejectedTokenHash: z
          .string()
          .length(64)
          .regex(new RE2(/^[0-9a-fA-F]{64}$/), "Must be the hex sha256 of the rejected access token")
          .describe(AGENT_VAULT.CREDENTIAL_REFRESH.rejectedTokenHash),
        requiredScopes: z
          .string()
          .min(1)
          .max(MAX_OAUTH_SCOPE_LENGTH)
          .regex(
            OAUTH_SCOPE_TOKEN_PATTERN,
            "Each scope must be an OAuth scope token: printable ASCII with no spaces, quotes or backslashes"
          )
          .array()
          .max(50)
          .optional()
          .describe(AGENT_VAULT.CREDENTIAL_REFRESH.requiredScopes)
      }),
      response: {
        200: z.object({
          credential: ResolvedBearerCredentialSchema.describe(AGENT_VAULT.CREDENTIAL_REFRESH.credential),
          status: z.nativeEnum(AgentVaultOauthStatus).describe(AGENT_VAULT.SERVICE.oauthStatus)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.AGENT_VAULT_PROXY_ACCESS_TOKEN]),
    handler: async (req) =>
      server.services.agentVaultProxy.refreshCredential({
        proxyId: req.permission.id,
        orgId: req.permission.orgId,
        sessionToken: req.headers[SESSION_HEADER],
        serviceId: req.params.serviceId,
        hostPattern: req.body.hostPattern,
        rejectedTokenHash: req.body.rejectedTokenHash,
        requiredScopes: req.body.requiredScopes
      })
  });

  server.route({
    method: "POST",
    url: "/sessions/:sessionId/logs/chunks",
    config: { rateLimit: agentVaultSessionLogChunkLimit },
    schema: {
      hide: true,
      operationId: "createAgentVaultSessionLogChunkUploadUrl",
      description:
        "Returns a presigned URL to upload an encrypted session log chunk to, and shows the chunk in the live view. If you send the same `chunkId` again, you get a new URL for the same object.",
      tags: [ApiDocsTags.AgentVaultSessionLogs],
      params: z.object({ sessionId: z.string().uuid().describe(AGENT_VAULT.SESSION.sessionId) }),
      body: AgentVaultSessionLogChunkCreateSchema,
      response: { 200: AgentVaultSessionLogChunkCreateResponseSchema }
    },
    onRequest: verifyAuth([AuthMode.AGENT_VAULT_PROXY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.agentVaultSessionLog.createChunkUploadUrl({
        proxyId: req.permission.id,
        sessionId: req.params.sessionId,
        chunk: req.body
      });
    }
  });
};
