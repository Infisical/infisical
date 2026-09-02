import { z } from "zod";

import {
  AgentVaultSessionScope,
  AgentVaultSessionStatus,
  AgentVaultSessionTtl
} from "@app/ee/services/agent-vault/agent-vault-enums";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { AGENT_VAULT } from "@app/lib/api-docs";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

import { AGENT_VAULT_MAX_SESSION_BUNDLES } from "@app/ee/services/agent-vault-session/agent-vault-session-service";

const SessionAccessBundleSchema = z.object({
  id: z.string().uuid().nullable(),
  name: z.string(),
  position: z.number()
});

export const registerAgentVaultSessionRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "listAgentVaultSessions",
      description: "List Agent Vault sessions",
      tags: [ApiDocsTags.AgentVaultSessions],
      querystring: z.object({
        scope: z
          .nativeEnum(AgentVaultSessionScope)
          .default(AgentVaultSessionScope.Mine)
          .describe(AGENT_VAULT.SESSION.scope),
        status: z.nativeEnum(AgentVaultSessionStatus).optional().describe(AGENT_VAULT.SESSION.status),
        limit: z.coerce.number().int().min(1).max(100).default(20).describe(AGENT_VAULT.SESSION.limit),
        offset: z.coerce.number().int().min(0).default(0).describe(AGENT_VAULT.SESSION.offset)
      }),
      response: {
        200: z.object({
          sessions: z
            .object({
              id: z.string().uuid().describe(AGENT_VAULT.SESSION.sessionId),
              userId: z.string().uuid().nullable(),
              identityId: z.string().uuid().nullable(),
              actorName: z.string(),
              status: z.nativeEnum(AgentVaultSessionStatus),
              expiresAt: z.date().nullable().describe(AGENT_VAULT.SESSION.expiresAt),
              revokedAt: z.date().nullable(),
              createdAt: z.date(),
              accessBundles: SessionAccessBundleSchema.array()
            })
            .array(),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) =>
      server.services.agentVaultSession.listSessions({
        projectId: req.internalAgentVaultProjectId,
        ctx: {
          actorId: req.permission.id,
          actor: req.permission.type,
          actorOrgId: req.permission.orgId,
          actorAuthMethod: req.permission.authMethod
        },
        ...req.query
      })
  });

  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "createAgentVaultSession",
      description: "Mint an Agent Vault session over access bundles you can reach",
      tags: [ApiDocsTags.AgentVaultSessions],
      body: z.object({
        // Caller order is the session's priority order, so duplicates are rejected rather than deduped.
        accessBundleIds: z
          .string()
          .uuid()
          .array()
          .min(1)
          .max(AGENT_VAULT_MAX_SESSION_BUNDLES)
          .describe(AGENT_VAULT.SESSION.accessBundleIds),
        ttl: z
          .nativeEnum(AgentVaultSessionTtl)
          .default(AgentVaultSessionTtl.SevenDays)
          .describe(AGENT_VAULT.SESSION.ttl)
      }),
      response: {
        200: z.object({
          session: z.object({
            id: z.string().uuid().describe(AGENT_VAULT.SESSION.sessionId),
            // Returned exactly once, at mint. Nothing stores it.
            token: z.string().describe(AGENT_VAULT.SESSION.token),
            expiresAt: z.date().nullable().describe(AGENT_VAULT.SESSION.expiresAt),
            createdAt: z.date(),
            accessBundles: SessionAccessBundleSchema.array()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { session, token } = await server.services.agentVaultSession.mintSession({
        projectId: req.internalAgentVaultProjectId,
        ctx: {
          actorId: req.permission.id,
          actor: req.permission.type,
          actorOrgId: req.permission.orgId,
          actorAuthMethod: req.permission.authMethod
        },
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_SESSION_MINT,
          metadata: {
            sessionId: session.id,
            accessBundleIds: req.body.accessBundleIds,
            expiresAt: session.expiresAt?.toISOString() ?? null
          }
        }
      });

      return { session: { ...session, token } };
    }
  });

  server.route({
    method: "POST",
    url: "/:sessionId/revoke",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "revokeAgentVaultSession",
      description: "Revoke an Agent Vault session",
      tags: [ApiDocsTags.AgentVaultSessions],
      params: z.object({ sessionId: z.string().uuid().describe(AGENT_VAULT.SESSION.sessionId) }),
      response: {
        200: z.object({
          session: z.object({
            id: z.string().uuid().describe(AGENT_VAULT.SESSION.sessionId),
            revokedAt: z.date().nullable()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const session = await server.services.agentVaultSession.revokeSession({
        projectId: req.internalAgentVaultProjectId,
        ctx: {
          actorId: req.permission.id,
          actor: req.permission.type,
          actorOrgId: req.permission.orgId,
          actorAuthMethod: req.permission.authMethod
        },
        sessionId: req.params.sessionId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_SESSION_REVOKE,
          metadata: { sessionId: session.id }
        }
      });

      return { session: { id: session.id, revokedAt: session.revokedAt ?? null } };
    }
  });
};
