import { z } from "zod";

import {
  agentVaultSessionLabelSchema,
  agentVaultSessionLabelUpdateSchema,
  describeSessionForAudit
} from "@app/ee/services/agent-vault-session/agent-vault-session-fns";
import {
  AGENT_VAULT_SESSION_MAX_TTL_MS,
  AGENT_VAULT_SESSION_TTL_NEVER
} from "@app/ee/services/agent-vault-session/agent-vault-session-service";
import { AGENT_VAULT_SKILL_UPLOAD_BODY_LIMIT } from "@app/ee/services/agent-vault-skill/agent-vault-skill-fns";
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
import { BadRequestError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { emitAgentVaultTelemetry } from "@app/server/lib/telemetry";
import { isUserSessionAuth } from "@app/server/plugins/auth/inject-identity";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import {
  actorContext,
  resolveRequestedProjectId,
  serviceTransformationNamesOf,
  serviceTypeReportFieldsOf
} from "./agent-vault-router-fns";
import {
  AgentVaultProjectIdSchema,
  AgentVaultSessionActorSchema,
  AgentVaultSessionOnBehalfOfSchema,
  AgentVaultSessionServiceSchema,
  AgentVaultSessionServicesInputSchema,
  AgentVaultSessionSkillSchema,
  AgentVaultSessionSkillsInputSchema
} from "./agent-vault-schemas";

const SessionAccessBundleSchema = z.object({
  id: z.string().uuid().nullable(),
  name: z.string()
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

const SessionServicesSchema = AgentVaultSessionServiceSchema.array().describe(AGENT_VAULT.SESSION.servicesRead);

const SessionSkillsSchema = AgentVaultSessionSkillSchema.array().describe(AGENT_VAULT.SESSION.skillsRead);

const SessionStatsSchema = z.object({
  requests: z.number().describe(AGENT_VAULT.SESSION.statsRequests),
  brokered: z.number().nullable().describe(AGENT_VAULT.SESSION.statsBrokered)
});

const SessionWithAccessBundleSchema = SessionSchema.extend({
  accessBundle: SessionAccessBundleSchema.nullable().describe(AGENT_VAULT.SESSION.accessBundleRead),
  services: SessionServicesSchema,
  skills: SessionSkillsSchema,
  stats: SessionStatsSchema.nullable().describe(AGENT_VAULT.SESSION.stats)
});

// CLI 0.43.132+ and the Python SDK send the list form. Keep until 2027-01-04, then remove.
// Done in a preprocess so the API reference only shows accessBundle.
const mapLegacyAccessBundles = (body: unknown) => {
  if (!body || typeof body !== "object" || !("accessBundles" in body)) return body;
  const { accessBundles, ...rest } = body as { accessBundles: unknown } & Record<string, unknown>;
  if ("accessBundle" in rest) {
    throw new BadRequestError({ message: "Send the access bundle as accessBundle only, not accessBundles as well" });
  }
  if (!Array.isArray(accessBundles) || accessBundles.length > 1) {
    throw new BadRequestError({ message: "A session carries one access bundle. Send its name as accessBundle." });
  }
  return accessBundles.length ? { ...rest, accessBundle: accessBundles[0] as unknown } : rest;
};

// Whole-body examples, so the docs show the usual session, one access bundle and no services or skills of its own,
// rather than one generated from every optional field. Responses always carry services and skills, so the examples
// show them empty.
const EXAMPLE_PROJECT_ID = "5f2c8a7e-1b3d-4e6f-9a0c-8d7b6e5f4a3c";

const EXAMPLE_ACCESS_BUNDLE = { id: "3c90c3cc-0d44-4b50-8888-8dd25736052a", name: "prod-deploy" };

const EXAMPLE_SESSION = {
  id: "d1f0b5a2-6c3e-4f8a-9b7d-2e4c6a8f0b13",
  label: "Nightly deploy",
  actor: { type: "machineIdentity", id: "7b1e4f2a-9c3d-4a6b-8e5f-1d2c3b4a5e6f", name: "deploy-bot" },
  onBehalfOf: null,
  status: "active",
  expiresAt: "2026-11-01T02:00:00.000Z",
  revokedAt: null,
  createdAt: "2026-10-31T18:00:00.000Z",
  accessBundle: EXAMPLE_ACCESS_BUNDLE,
  services: [],
  skills: [],
  stats: { requests: 1284, brokered: 1102 }
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
        projectId: AgentVaultProjectIdSchema,
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
            sessions: SessionWithAccessBundleSchema.array(),
            totalCount: z.number()
          })
          .describe(docsExample({ sessions: [EXAMPLE_SESSION], totalCount: 1 }))
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { projectId: requestedProjectId, status, ...query } = req.query;
      const projectId = await resolveRequestedProjectId(req, requestedProjectId, "query");
      return server.services.agentVaultSession.listSessions({
        projectId,
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
        200: z.object({ session: SessionWithAccessBundleSchema }).describe(docsExample({ session: EXAMPLE_SESSION }))
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const projectId = await server.services.agentVaultProjectResolver.resolveFromSession(
        actorContext(req),
        req.params.sessionId
      );
      return server.services.agentVaultSession.getSessionById({
        projectId,
        sessionId: req.params.sessionId,
        ctx: actorContext(req)
      });
    }
  });

  server.route({
    method: "POST",
    url: "/",
    // Skills sent with the session carry their files, so the body may be as large as a skill upload's.
    config: { rateLimit: writeLimit },
    bodyLimit: AGENT_VAULT_SKILL_UPLOAD_BODY_LIMIT,
    schema: {
      hide: false,
      operationId: "createAgentVaultSession",
      description:
        "Create an Agent Vault session with an access bundle you can reach, the project's services and skills you can reach named one by one, services (Agent Vault admins) and skills of its own, or any mix of them, for yourself or, as a machine identity with a delegation, on behalf of a user",
      tags: [ApiDocsTags.AgentVaultSessions],
      body: z.preprocess(
        mapLegacyAccessBundles,
        z
          .object({
            projectId: AgentVaultProjectIdSchema,
            accessBundle: slugSchema({ max: 64, field: "Access bundle" })
              .optional()
              .describe(AGENT_VAULT.SESSION.accessBundle),
            // Optional rather than defaulted, so the docs' request example leaves them out instead of showing empty lists.
            services: AgentVaultSessionServicesInputSchema.optional(),
            skills: AgentVaultSessionSkillsInputSchema.optional(),
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
            docsExample({
              projectId: EXAMPLE_PROJECT_ID,
              services: ["github", "linear"],
              skills: ["code-review"],
              ttl: "8h",
              label: EXAMPLE_SESSION.label
            })
          )
      ),
      response: {
        200: z
          .object({
            session: z.object({
              id: z.string().uuid().describe(AGENT_VAULT.SESSION.sessionId),
              projectId: z.string().uuid().describe(AGENT_VAULT.projectId),
              label: z.string().nullable().describe(AGENT_VAULT.SESSION.label),
              token: z.string().describe(AGENT_VAULT.SESSION.token),
              expiresAt: z.date().nullable().describe(AGENT_VAULT.SESSION.expiresAt),
              createdAt: z.date(),
              accessBundle: SessionAccessBundleSchema.nullable().describe(AGENT_VAULT.SESSION.accessBundleRead),
              services: SessionServicesSchema,
              skills: SessionSkillsSchema
            })
          })
          .describe(
            docsExample({
              session: {
                id: EXAMPLE_SESSION.id,
                projectId: EXAMPLE_PROJECT_ID,
                label: EXAMPLE_SESSION.label,
                token: "agv_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
                expiresAt: EXAMPLE_SESSION.expiresAt,
                createdAt: EXAMPLE_SESSION.createdAt,
                accessBundle: EXAMPLE_ACCESS_BUNDLE,
                services: [],
                skills: []
              }
            })
          )
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { projectId: requestedProjectId, ...body } = req.body;
      const projectId = await resolveRequestedProjectId(req, requestedProjectId, "body");
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
        projectId,
        ctx: actorContext(req),
        ...body
      });
      const namedServices = session.services.filter((service) => !service.isInline);
      const inlineServices = session.services.flatMap((service) => (service.isInline ? [service] : []));
      const namedSkills = session.skills.filter((skill) => !skill.isInline);
      const inlineSkills = session.skills.flatMap((skill) => (skill.isInline ? [skill] : []));

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
        event: {
          type: EventType.AGENT_VAULT_SESSION_MINT,
          metadata: {
            sessionId: session.id,
            label: session.label,
            accessBundleId: session.accessBundle?.id ?? null,
            accessBundleName: session.accessBundle?.name ?? null,
            expiresAt: session.expiresAt?.toISOString() ?? null,
            ...(namedServices.length > 0 && {
              namedServices: namedServices.map((service) => ({ serviceId: service.id, name: service.name }))
            }),
            ...(inlineServices.length > 0 && {
              services: inlineServices.map((service) => {
                const { allowedMethods, allowedPathPrefixes, ...typeFields } = serviceTypeReportFieldsOf(service);
                return {
                  serviceId: service.id,
                  name: service.name,
                  description: service.description,
                  serviceType: service.type,
                  ...typeFields,
                  credentialType: service.credential.type,
                  headerName:
                    service.credential.type === AgentVaultCredentialType.Bearer
                      ? service.credential.headerName
                      : undefined,
                  // Present on every service, null outside HTTP, as this event has always sent them.
                  allowedMethods: allowedMethods ?? null,
                  allowedPathPrefixes: allowedPathPrefixes ?? null,
                  hookUrl: service.hook?.url,
                  ...serviceTransformationNamesOf(service)
                };
              })
            }),
            ...(namedSkills.length > 0 && {
              namedSkills: namedSkills.map((skill) => ({ skillId: skill.id, name: skill.name }))
            }),
            ...(inlineSkills.length > 0 && {
              skills: inlineSkills.map((skill) => ({
                skillId: skill.id,
                name: skill.name,
                description: skill.description,
                sha256: skill.sha256,
                sizeBytes: skill.sizeBytes,
                fileCount: skill.fileCount
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
          accessBundleId: session.accessBundle?.id ?? null,
          inlineServiceCount: inlineServices.length,
          namedServiceCount: namedServices.length,
          inlineSkillCount: inlineSkills.length,
          namedSkillCount: namedSkills.length,
          ttlSeconds,
          isOnBehalfOfUser: Boolean(onBehalfOf)
        }
      });

      return { session: { ...session, projectId, token } };
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
        200: z.object({ session: SessionWithAccessBundleSchema }).describe(docsExample({ session: EXAMPLE_SESSION }))
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const projectId = await server.services.agentVaultProjectResolver.resolveFromSession(
        actorContext(req),
        req.params.sessionId
      );
      const { session, previousLabel } = await server.services.agentVaultSession.updateSessionLabel({
        projectId,
        ctx: actorContext(req),
        sessionId: req.params.sessionId,
        label: req.body.label
      });

      if (previousLabel !== session.label) {
        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          orgId: req.permission.orgId,
          projectId,
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
      const projectId = await server.services.agentVaultProjectResolver.resolveFromSession(
        actorContext(req),
        req.params.sessionId
      );
      const { session, revokedNow } = await server.services.agentVaultSession.revokeSession({
        projectId,
        ctx: actorContext(req),
        sessionId: req.params.sessionId
      });

      // Revoking is idempotent, so a repeat would otherwise credit the second caller with a revocation.
      if (revokedNow) {
        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          orgId: req.permission.orgId,
          projectId,
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
