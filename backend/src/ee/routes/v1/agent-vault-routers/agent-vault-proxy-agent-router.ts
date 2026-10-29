import RE2 from "re2";
import { z } from "zod";

import {
  MAX_OAUTH_SCOPE_LENGTH,
  OAUTH_SCOPE_TOKEN_PATTERN
} from "@app/ee/services/agent-vault-oauth/agent-vault-oauth-discovery-fns";
import {
  AgentVaultSessionLogChunkCreateResponseSchema,
  AgentVaultSessionLogChunkCreateSchema
} from "@app/ee/services/agent-vault-session-log/agent-vault-session-log-schemas";
import { AGENT_VAULT_SESSION_TOKEN_PREFIX } from "@app/ee/services/agent-vault-session/agent-vault-session-fns";
import {
  AgentVaultCredentialType,
  AgentVaultOauthStatus,
  AgentVaultServiceType,
  AgentVaultTrafficPolicy
} from "@app/ee/services/agent-vault/agent-vault-enums";
import { AGENT_VAULT } from "@app/lib/api-docs";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { UnauthorizedError } from "@app/lib/errors";
import {
  agentVaultBootstrapLimit,
  agentVaultCredentialRefreshLimit,
  agentVaultHeartbeatLimit,
  agentVaultResolveLimit,
  agentVaultSessionLogChunkLimit
} from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { AgentVaultHostPatternSchema } from "./agent-vault-schemas";

const ProxyConfigSchema = z.object({
  trafficPolicy: z.nativeEnum(AgentVaultTrafficPolicy).describe(AGENT_VAULT.PROXY.trafficPolicy),
  allowedHosts: z.string().nullable().describe(AGENT_VAULT.PROXY.allowedHosts),
  pollInterval: z.number().describe(AGENT_VAULT.PROXY.pollInterval)
});

const RootCaSchema = z
  .object({
    certificate: z.string().describe(AGENT_VAULT.PROXY.rootCaCertificatePem),
    privateKey: z.string().describe(AGENT_VAULT.PROXY.rootCaPrivateKey)
  })
  .describe(AGENT_VAULT.PROXY.rootCa);

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
    type: z.literal(AgentVaultCredentialType.Bearer).describe(AGENT_VAULT.CREDENTIAL_REFRESH.credentialType),
    headerName: z.string().describe(AGENT_VAULT.SERVICE.headerName),
    headerPrefix: z.string().describe(AGENT_VAULT.SERVICE.headerPrefix),
    value: z.string().describe(AGENT_VAULT.CREDENTIAL_REFRESH.value),
    source: z.literal(AgentVaultCredentialType.OAuth).optional().describe(AGENT_VAULT.CREDENTIAL_REFRESH.source),
    expiresAt: z.string().nullable().optional().describe(AGENT_VAULT.SERVICE.oauthExpiresAt)
  })
  .describe(JSON.stringify({ title: "Bearer" }));

const RejectedTokenHashSchema = z
  .string()
  .length(64)
  .regex(new RE2(/^[0-9a-fA-F]{64}$/), "Must be the hex sha256 of the rejected access token");

export const registerAgentVaultProxyAgentRouter = async (server: FastifyZodProvider) => {
  // POST, not GET: a proxy serving its own certificate authority reports it here, and that is recorded.
  server.route({
    method: "POST",
    url: "/bootstrap",
    config: { rateLimit: agentVaultBootstrapLimit },
    schema: {
      hide: true,
      operationId: "bootstrapAgentVaultProxy",
      description:
        "Start a proxy: returns its identity, settings and, unless it serves its own, the certificate authority",
      tags: [ApiDocsTags.AgentVaultProxies],
      body: z.object({
        servedCaCertificate: z
          .string()
          .trim()
          .min(1)
          .max(16384)
          .optional()
          .describe(AGENT_VAULT.PROXY.servedCaCertificate)
      }),
      response: {
        200: z.object({
          proxyId: z.string().uuid().describe(AGENT_VAULT.PROXY.proxyId),
          name: z.string().describe(AGENT_VAULT.PROXY.name),
          config: ProxyConfigSchema,
          rootCa: RootCaSchema.optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.AGENT_VAULT_PROXY_ACCESS_TOKEN]),
    handler: async (req) => {
      if (req.auth.authMode !== AuthMode.AGENT_VAULT_PROXY_ACCESS_TOKEN) {
        throw new UnauthorizedError({ message: "A proxy token is required" });
      }
      return server.services.agentVaultProxy.bootstrap({
        proxyId: req.permission.id,
        tokenVersion: req.auth.token.tokenVersion,
        servedCaCertificate: req.body.servedCaCertificate
      });
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
                  .object({
                    type: z.literal(AgentVaultCredentialType.Basic),
                    username: z.string(),
                    password: z.string()
                  })
                  .describe(JSON.stringify({ title: "Basic Auth" })),
                z
                  .object({ type: z.literal(AgentVaultCredentialType.Passthrough) })
                  .describe(JSON.stringify({ title: "Pass-through" }))
              ]),
              customHeaders: z.object({ name: z.string(), prefix: z.string(), value: z.string() }).array(),
              substitutions: z
                .object({ placeholder: z.string(), surfaces: z.string().array(), value: z.string() })
                .array(),
              personalValuesMissing: z.boolean()
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
        "Get a new access token after the MCP server rejected the current one. Returns 409 if the service now points at a different server.",
      tags: [ApiDocsTags.AgentVaultProxies],
      headers: SessionHeaderSchema,
      params: z.object({ serviceId: z.string().uuid().describe(AGENT_VAULT.SERVICE.serviceId) }),
      body: z.object({
        hostPattern: AgentVaultHostPatternSchema.describe(AGENT_VAULT.CREDENTIAL_REFRESH.hostPattern),
        rejectedTokenHash: RejectedTokenHashSchema.describe(AGENT_VAULT.CREDENTIAL_REFRESH.rejectedTokenHash)
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
        rejectedTokenHash: req.body.rejectedTokenHash
      })
  });

  server.route({
    method: "POST",
    url: "/services/:serviceId/missing-scopes",
    config: { rateLimit: agentVaultCredentialRefreshLimit },
    schema: {
      hide: true,
      operationId: "reportAgentVaultServiceMissingScopes",
      description:
        "Record the scopes an MCP server asked for in an insufficient_scope challenge, so the service shows it needs reauthorizing with them. The token is not refreshed. A report for a token that is no longer current changes nothing. A 409 means the service's host pattern no longer matches `hostPattern`.",
      tags: [ApiDocsTags.AgentVaultProxies],
      headers: SessionHeaderSchema,
      params: z.object({ serviceId: z.string().uuid().describe(AGENT_VAULT.SERVICE.serviceId) }),
      body: z.object({
        hostPattern: AgentVaultHostPatternSchema.describe(AGENT_VAULT.CREDENTIAL_REFRESH.hostPattern),
        rejectedTokenHash: RejectedTokenHashSchema.describe(AGENT_VAULT.CREDENTIAL_REFRESH.rejectedTokenHash),
        requiredScopes: z
          .string()
          .min(1)
          .max(MAX_OAUTH_SCOPE_LENGTH)
          .regex(
            OAUTH_SCOPE_TOKEN_PATTERN,
            "Each scope must be an OAuth scope token: printable ASCII with no spaces, quotes or backslashes"
          )
          .array()
          .min(1)
          .max(50)
          .describe(AGENT_VAULT.CREDENTIAL_REFRESH.requiredScopes)
      }),
      response: {
        204: z.string().length(0)
      }
    },
    onRequest: verifyAuth([AuthMode.AGENT_VAULT_PROXY_ACCESS_TOKEN]),
    handler: async (req, res) => {
      await server.services.agentVaultProxy.reportMissingScopes({
        proxyId: req.permission.id,
        orgId: req.permission.orgId,
        sessionToken: req.headers[SESSION_HEADER],
        serviceId: req.params.serviceId,
        hostPattern: req.body.hostPattern,
        rejectedTokenHash: req.body.rejectedTokenHash,
        requiredScopes: req.body.requiredScopes
      });
      return res.status(204).send("");
    }
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
      const { orgId, storageType, ...upload } = await server.services.agentVaultSessionLog.createChunkUploadUrl({
        proxyId: req.permission.id,
        sessionId: req.params.sessionId,
        chunk: req.body
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.AgentVaultSessionLogChunkAccepted,
          distinctId: `agent-vault-proxy-${req.permission.id}`,
          organizationId: orgId,
          properties: {
            orgId,
            storageType,
            bytes: req.body.ciphertextBytes,
            ...(req.body.recordCount !== undefined && { records: req.body.recordCount })
          }
        })
        .catch(() => {});

      return upload;
    }
  });
};
