import { z } from "zod";

import {
  agentVaultSessionLabelSchema,
  agentVaultSessionLabelUpdateSchema,
  describeSessionForAudit
} from "@app/ee/services/agent-vault-session/agent-vault-session-fns";
import {
  AGENT_VAULT_MAX_SESSION_BUNDLES,
  AGENT_VAULT_SESSION_MAX_TTL_MS,
  AGENT_VAULT_SESSION_TTL_NEVER
} from "@app/ee/services/agent-vault-session/agent-vault-session-service";
import {
  AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE,
  AGENT_VAULT_NO_CONTROL_CHARS_RE
} from "@app/ee/services/agent-vault/agent-vault-credential-schemas";
import {
  AgentVaultCredentialType,
  AgentVaultSessionScope,
  AgentVaultSessionStatus
} from "@app/ee/services/agent-vault/agent-vault-enums";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { AGENT_VAULT } from "@app/lib/api-docs";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { ms } from "@app/lib/ms";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { emitAgentVaultTelemetry } from "@app/server/lib/telemetry";
import { isUserSessionAuth } from "@app/server/plugins/auth/inject-identity";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { actorContext } from "./agent-vault-router-fns";
import {
  AgentVaultInlineServiceSchema,
  AgentVaultInlineServicesInputSchema,
  AgentVaultSessionActorSchema,
  AgentVaultSessionOnBehalfOfSchema
} from "./agent-vault-schemas";

const SessionAccessBundleSchema = z.object({
  id: z.string().uuid().nullable(),
  name: z.string(),
  position: z.number()
});

const SessionSchema = z.object({
  id: z.string().uuid().describe(AGENT_VAULT.SESSION.sessionId),
  label: z.string().nullable().describe(AGENT_VAULT.SESSION.label),
  actor: AgentVaultSessionActorSchema,
  onBehalfOf: AgentVaultSessionOnBehalfOfSchema.nullable().describe(AGENT_VAULT.SESSION.onBehalfOfSession),
  status: z.nativeEnum(AgentVaultSessionStatus),
  expiresAt: z.date().nullable().describe(AGENT_VAULT.SESSION.expiresAt),
  revokedAt: z.date().nullable(),
  createdAt: z.date()
});

const SessionInlineServicesSchema = AgentVaultInlineServiceSchema.array().describe(
  AGENT_VAULT.SESSION.inlineServicesRead
);

const SessionWithAccessBundlesSchema = SessionSchema.extend({
  accessBundles: SessionAccessBundleSchema.array(),
  services: SessionInlineServicesSchema
});

// Whole-body examples, so the docs show the usual session, one access bundle and no services of its own, rather
// than one generated from every optional field.
const EXAMPLE_ACCESS_BUNDLE = { id: "3c90c3cc-0d44-4b50-8888-8dd25736052a", name: "prod-deploy", position: 0 };

const EXAMPLE_SESSION = {
  id: "d1f0b5a2-6c3e-4f8a-9b7d-2e4c6a8f0b13",
  label: "Nightly deploy",
  actor: { type: "machineIdentity", id: "7b1e4f2a-9c3d-4a6b-8e5f-1d2c3b4a5e6f", name: "deploy-bot" },
  onBehalfOf: null,
  status: "active",
  expiresAt: "2026-11-01T02:00:00.000Z",
  revokedAt: null,
  createdAt: "2026-10-31T18:00:00.000Z",
  accessBundles: [EXAMPLE_ACCESS_BUNDLE]
};

const docsExample = (example: unknown) => JSON.stringify({ example });

export const registerAgentVaultSessionRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listAgentVaultSessions",
      description: "List Agent Vault sessions",
      tags: [ApiDocsTags.AgentVaultSessions],
      querystring: z.object({
        scope: z
          .nativeEnum(AgentVaultSessionScope)
          .default(AgentVaultSessionScope.Mine)
          .describe(AGENT_VAULT.SESSION.scope),
        status: z
          .string()
          .trim()
          .max(64)
          .optional()
          .transform((val) => (val ? [...new Set(val.split(",").map((status) => status.trim()))] : undefined))
          .pipe(z.nativeEnum(AgentVaultSessionStatus).array().optional())
          .describe(AGENT_VAULT.SESSION.status),
        search: z
          .string()
          .trim()
          .max(255)
          .regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE)
          .optional()
          .describe(AGENT_VAULT.SESSION.search),
        limit: z.coerce.number().int().min(1).max(100).default(20).describe(AGENT_VAULT.SESSION.limit),
        offset: z.coerce.number().int().min(0).default(0).describe(AGENT_VAULT.SESSION.offset)
      }),
      response: {
        200: z
          .object({
            sessions: SessionWithAccessBundlesSchema.array(),
            totalCount: z.number()
          })
          .describe(docsExample({ sessions: [EXAMPLE_SESSION], totalCount: 1 }))
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { status, ...query } = req.query;
      return server.services.agentVaultSession.listSessions({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        statuses: status,
        ...query
      });
    }
  });

  server.route({
    method: "GET",
    url: "/:sessionId",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "getAgentVaultSession",
      description: "Gets an Agent Vault session.",
      tags: [ApiDocsTags.AgentVaultSessions],
      params: z.object({ sessionId: z.string().uuid().describe(AGENT_VAULT.SESSION.sessionId) }),
      response: {
        200: z.object({ session: SessionWithAccessBundlesSchema }).describe(docsExample({ session: EXAMPLE_SESSION }))
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) =>
      server.services.agentVaultSession.getSessionById({
        projectId: req.internalAgentVaultProjectId,
        sessionId: req.params.sessionId,
        ctx: actorContext(req)
      })
  });

  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "createAgentVaultSession",
      description:
        "Create an Agent Vault session with an access bundle you can reach, services of its own (Agent Vault admins), or both, for yourself or, as a machine identity with a delegation, on behalf of a user",
      tags: [ApiDocsTags.AgentVaultSessions],
      body: z
        .object({
          accessBundles: slugSchema({ max: 64, field: "Access bundle" })
            .array()
            .max(AGENT_VAULT_MAX_SESSION_BUNDLES)
            .default([])
            .describe(AGENT_VAULT.SESSION.accessBundles),
          // Optional rather than defaulted, so the docs' request example leaves it out instead of showing an empty list.
          services: AgentVaultInlineServicesInputSchema.optional(),
          // Optional rather than defaulted: the default depends on whether the session is on a user's behalf.
          ttl: z
            .string()
            .trim()
            .optional()
            .superRefine((val, ctx) => {
              if (val === undefined) return;
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
                  message: "TTL must be a duration of at least 1 minute, such as 30m, 8h, 7d, or never"
                });
                return;
              }
              if (parsed > AGENT_VAULT_SESSION_MAX_TTL_MS) {
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  message: "TTL must be at most 100 years. Use never for a session that doesn't expire"
                });
              }
            })
            .describe(AGENT_VAULT.SESSION.ttl),
          onBehalfOf: z
            .object({
              userId: z.string().uuid().optional().describe(AGENT_VAULT.SESSION.onBehalfOfUserId),
              userEmail: z
                .string()
                .trim()
                .toLowerCase()
                .email()
                .max(255)
                .optional()
                .describe(AGENT_VAULT.SESSION.onBehalfOfUserEmail)
            })
            .refine((val) => Boolean(val.userId) !== Boolean(val.userEmail), {
              message: "Name the user by userId or by userEmail, not both"
            })
            .optional()
            .describe(
              JSON.stringify({
                description: AGENT_VAULT.SESSION.onBehalfOf,
                example: { userEmail: "jsmith@example.com" }
              })
            ),
          label: agentVaultSessionLabelSchema.describe(AGENT_VAULT.SESSION.label)
        })
        .describe(
          docsExample({ accessBundles: [EXAMPLE_ACCESS_BUNDLE.name], ttl: "8h", label: EXAMPLE_SESSION.label })
        ),
      response: {
        200: z
          .object({
            session: z.object({
              id: z.string().uuid().describe(AGENT_VAULT.SESSION.sessionId),
              label: z.string().nullable().describe(AGENT_VAULT.SESSION.label),
              token: z.string().describe(AGENT_VAULT.SESSION.token),
              expiresAt: z.date().nullable().describe(AGENT_VAULT.SESSION.expiresAt),
              createdAt: z.date(),
              accessBundles: SessionAccessBundleSchema.array(),
              services: SessionInlineServicesSchema
            })
          })
          .describe(
            docsExample({
              session: {
                id: EXAMPLE_SESSION.id,
                label: EXAMPLE_SESSION.label,
                token: "agv_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
                expiresAt: EXAMPLE_SESSION.expiresAt,
                createdAt: EXAMPLE_SESSION.createdAt,
                accessBundles: [EXAMPLE_ACCESS_BUNDLE]
              }
            })
          )
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

      const { session, token, ttlSeconds, onBehalfOf } = await server.services.agentVaultSession.mintSession({
        actorName,
        actorEmail,
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
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
            label: session.label,
            accessBundleId: session.accessBundles[0]?.id ?? null,
            accessBundleName: session.accessBundles[0]?.name ?? null,
            expiresAt: session.expiresAt?.toISOString() ?? null,
            ...(session.services.length > 0 && {
              services: session.services.map((service) => ({
                serviceId: service.id,
                name: service.name,
                serviceType: service.type,
                serverUrl: service.serverUrl ?? undefined,
                hostPattern: service.hostPattern,
                credentialType: service.credential.type,
                headerName:
                  service.credential.type === AgentVaultCredentialType.Bearer
                    ? service.credential.headerName
                    : undefined,
                allowedMethods: service.allowedMethods,
                allowedPathPrefixes: service.allowedPathPrefixes,
                customHeaderNames: service.customHeaders.map((header) => header.name),
                substitutionPlaceholders: service.substitutions.map((substitution) => substitution.placeholder)
              }))
            }),
            ...(onBehalfOf && {
              onBehalfOfUserId: onBehalfOf.userId,
              onBehalfOfUserName: onBehalfOf.username,
              ...(onBehalfOf.email && { onBehalfOfUserEmail: onBehalfOf.email })
            })
          }
        }
      });

      emitAgentVaultTelemetry(server.services.telemetry, req, {
        event: PostHogEventTypes.AgentVaultSessionCreated,
        properties: {
          sessionId: session.id,
          accessBundleId: session.accessBundles[0]?.id ?? null,
          inlineServiceCount: session.services.length,
          ttlSeconds,
          isOnBehalfOfUser: Boolean(onBehalfOf)
        }
      });

      return { session: { ...session, token } };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:sessionId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "updateAgentVaultSession",
      description: "Update the label of an Agent Vault session",
      tags: [ApiDocsTags.AgentVaultSessions],
      params: z.object({ sessionId: z.string().uuid().describe(AGENT_VAULT.SESSION.sessionId) }),
      body: z.object({
        label: agentVaultSessionLabelUpdateSchema.describe(AGENT_VAULT.SESSION.updateLabel)
      }),
      response: {
        200: z.object({ session: SessionWithAccessBundlesSchema }).describe(docsExample({ session: EXAMPLE_SESSION }))
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { session, previousLabel } = await server.services.agentVaultSession.updateSessionLabel({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        sessionId: req.params.sessionId,
        label: req.body.label
      });

      if (previousLabel !== session.label) {
        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          orgId: req.permission.orgId,
          projectId: req.internalAgentVaultProjectId,
          event: {
            type: EventType.AGENT_VAULT_SESSION_UPDATE,
            metadata: {
              sessionId: session.id,
              label: session.label,
              previousLabel,
              ...describeSessionForAudit(session)
            }
          }
        });
      }

      return { session };
    }
  });

  server.route({
    method: "POST",
    url: "/:sessionId/revoke",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
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
        ctx: actorContext(req),
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
            metadata: { sessionId: session.id, label: session.label, ...describeSessionForAudit(session) }
          }
        });

        emitAgentVaultTelemetry(server.services.telemetry, req, {
          event: PostHogEventTypes.AgentVaultSessionRevoked,
          properties: { sessionId: session.id }
        });
      }

      return { session };
    }
  });
};
