import { z } from "zod";

import { AgentVaultSessionScope, AgentVaultSessionStatus } from "@app/ee/services/agent-vault/agent-vault-enums";
import {
  AGENT_VAULT_MAX_SESSION_BUNDLES,
  AGENT_VAULT_SESSION_DEFAULT_TTL,
  AGENT_VAULT_SESSION_TTL_NEVER
} from "@app/ee/services/agent-vault-session/agent-vault-session-service";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { AGENT_VAULT } from "@app/lib/api-docs";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { ms } from "@app/lib/ms";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { isUserSessionAuth } from "@app/server/plugins/auth/inject-identity";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const SessionAccessBundleSchema = z.object({
  id: z.string().uuid().nullable(),
  name: z.string(),
  position: z.number()
});

const SessionSchema = z.object({
  id: z.string().uuid().describe(AGENT_VAULT.SESSION.sessionId),
  userId: z.string().uuid().nullable(),
  identityId: z.string().uuid().nullable(),
  actorName: z.string(),
  actorEmail: z.string().nullable(),
  status: z.nativeEnum(AgentVaultSessionStatus),
  expiresAt: z.date().nullable().describe(AGENT_VAULT.SESSION.expiresAt),
  revokedAt: z.date().nullable(),
  createdAt: z.date()
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
        search: z.string().trim().max(255).optional().describe(AGENT_VAULT.SESSION.search),
        limit: z.coerce.number().int().min(1).max(100).default(20).describe(AGENT_VAULT.SESSION.limit),
        offset: z.coerce.number().int().min(0).max(10000).default(0).describe(AGENT_VAULT.SESSION.offset)
      }),
      response: {
        200: z.object({
          sessions: SessionSchema.extend({ accessBundles: SessionAccessBundleSchema.array() }).array(),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
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
      description: "Mint an Agent Vault session over an access bundle you can reach",
      tags: [ApiDocsTags.AgentVaultSessions],
      body: z.object({
        accessBundles: slugSchema({ max: 64, field: "Access bundle" })
          .array()
          .min(1)
          .max(AGENT_VAULT_MAX_SESSION_BUNDLES)
          .describe(AGENT_VAULT.SESSION.accessBundles),
        ttl: z
          .string()
          .trim()
          .default(AGENT_VAULT_SESSION_DEFAULT_TTL)
          .superRefine((val, ctx) => {
            if (val === AGENT_VAULT_SESSION_TTL_NEVER) return;
            let parsed: number | undefined;
            try {
              parsed = ms(val);
            } catch {
              parsed = undefined;
            }
            if (typeof parsed !== "number" || Number.isNaN(parsed) || parsed < 60 * 1000) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "TTL must be a duration of at least 1 minute, such as 30m, 8h or 7d, or never"
              });
            }
          })
          .describe(AGENT_VAULT.SESSION.ttl)
      }),
      response: {
        200: z.object({
          session: z.object({
            id: z.string().uuid().describe(AGENT_VAULT.SESSION.sessionId),
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
      // Snapshotted from the request, the way PAM's session create does it, so a deleted actor still names
      // the session it held. Nothing extra is queried for it.
      let actorEmail: string | null = null;
      let actorName = "";
      if (isUserSessionAuth(req.auth)) {
        actorEmail = req.auth.user.email ?? null;
        actorName = `${req.auth.user.firstName ?? ""} ${req.auth.user.lastName ?? ""}`.trim() || (actorEmail ?? "");
      } else if (req.auth.authMode === AuthMode.IDENTITY_ACCESS_TOKEN) {
        actorName = req.auth.identityName;
      }

      const { session, token } = await server.services.agentVaultSession.mintSession({
        actorName,
        actorEmail,
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
            accessBundleId: session.accessBundles[0].id,
            accessBundleName: session.accessBundles[0].name,
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
      response: { 200: z.object({ session: SessionSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { session, revokedNow } = await server.services.agentVaultSession.revokeSession({
        projectId: req.internalAgentVaultProjectId,
        ctx: {
          actorId: req.permission.id,
          actor: req.permission.type,
          actorOrgId: req.permission.orgId,
          actorAuthMethod: req.permission.authMethod
        },
        sessionId: req.params.sessionId
      });

      // Revoking is idempotent, so a repeat would otherwise credit the second caller with a revocation.
      if (revokedNow) {
        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          orgId: req.permission.orgId,
          projectId: req.internalAgentVaultProjectId,
          event: {
            type: EventType.AGENT_VAULT_SESSION_REVOKE,
            metadata: { sessionId: session.id }
          }
        });
      }

      return { session };
    }
  });
};
