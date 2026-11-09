import { z } from "zod";

import { TAgentVaultSessions } from "@app/db/schemas";
import { AGENT_VAULT_SESSION_TOKEN_PREFIX } from "@app/ee/services/agent-vault-session/agent-vault-session-fns";
import { getAgentVaultBuiltinSkillOrNull } from "@app/ee/services/agent-vault-skill/agent-vault-builtin-skill";
import { AgentVaultServiceType } from "@app/ee/services/agent-vault/agent-vault-enums";
import { EventType, IdentityActor, UserActor, UserAgentType } from "@app/ee/services/audit-log/audit-log-types";
import { AGENT_VAULT } from "@app/lib/api-docs";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { UnauthorizedError } from "@app/lib/errors";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { ActorType } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { AgentVaultSkillFilesResponseSchema } from "./agent-vault-schemas";

const BEARER_PREFIX = "Bearer ";
const SESSION_TOKEN_MAX_LENGTH = 128;

const SessionTokenAuthorizationSchema = z
  .string()
  .max(BEARER_PREFIX.length + SESSION_TOKEN_MAX_LENGTH)
  .startsWith(BEARER_PREFIX)
  .transform((header) => header.slice(BEARER_PREFIX.length).trim())
  .pipe(
    z
      .string()
      .min(AGENT_VAULT_SESSION_TOKEN_PREFIX.length + 1)
      .max(SESSION_TOKEN_MAX_LENGTH)
      .startsWith(AGENT_VAULT_SESSION_TOKEN_PREFIX)
  );

const SessionSkillSchema = z.object({
  id: z.string().uuid().describe(AGENT_VAULT.SKILL.skillId),
  name: z.string().describe(AGENT_VAULT.SKILL.name),
  version: z.number().describe(AGENT_VAULT.SKILL.version),
  sha256: z.string().describe(AGENT_VAULT.SKILL.sha256),
  files: AgentVaultSkillFilesResponseSchema,
  isBuiltin: z.boolean().describe(AGENT_VAULT.SKILL.isBuiltin)
});

const SessionServiceSchema = z.object({
  name: z.string().describe(AGENT_VAULT.SESSION_SERVICES.serviceName),
  description: z.string().nullable().describe(AGENT_VAULT.SESSION_SERVICES.serviceDescription),
  type: z.nativeEnum(AgentVaultServiceType).describe(AGENT_VAULT.SESSION_SERVICES.serviceType),
  hosts: z.string().array().describe(AGENT_VAULT.SESSION_SERVICES.hosts),
  url: z.string().nullable().describe(AGENT_VAULT.SESSION_SERVICES.url),
  transport: z.string().optional().describe(AGENT_VAULT.SESSION_SERVICES.transport),
  status: z.enum(["ready", "needs-personal-values"]).describe(AGENT_VAULT.SESSION_SERVICES.status),
  credential: z
    .object({
      type: z.enum(["bearer", "oauth", "basic", "none"]).describe(AGENT_VAULT.SESSION_SERVICES.credentialType),
      header: z.string().optional().describe(AGENT_VAULT.SESSION_SERVICES.credentialHeader),
      addedByProxy: z.boolean().describe(AGENT_VAULT.SESSION_SERVICES.credentialAddedByProxy),
      memberProvided: z.boolean().describe(AGENT_VAULT.SESSION_SERVICES.credentialMemberProvided)
    })
    .describe(AGENT_VAULT.SESSION_SERVICES.credential),
  customHeaders: z.string().array().describe(AGENT_VAULT.SESSION_SERVICES.customHeaders),
  placeholders: z
    .object({
      placeholder: z.string().describe(AGENT_VAULT.SESSION_SERVICES.placeholder),
      surfaces: z.string().array().describe(AGENT_VAULT.SESSION_SERVICES.placeholderSurfaces)
    })
    .array()
    .describe(AGENT_VAULT.SESSION_SERVICES.placeholders),
  allowedMethods: z.string().array().nullable().describe(AGENT_VAULT.SESSION_SERVICES.allowedMethods),
  allowedPathPrefixes: z.string().array().nullable().describe(AGENT_VAULT.SESSION_SERVICES.allowedPathPrefixes),
  allowedTools: z.string().array().nullable().describe(AGENT_VAULT.SESSION_SERVICES.allowedTools),
  howToUse: z.string().describe(AGENT_VAULT.SESSION_SERVICES.howToUse)
});

// Optional and never refused: a value that isn't a proxy ID or a short version only leaves the traffic policy out.
const ProxyIdHeaderSchema = z.string().uuid();
const ProxyVersionHeaderSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[\x21-\x7e]+$/);

const sessionOwnerActor = (
  session: TAgentVaultSessions,
  ownerUser: { username: string; email: string | null } | null
): UserActor | IdentityActor =>
  session.userId && ownerUser
    ? { type: ActorType.USER, metadata: { userId: session.userId, ...ownerUser } }
    : { type: ActorType.IDENTITY, metadata: { identityId: session.identityId!, name: session.actorName } };

export const registerAgentVaultSessionTokenRouter = async (server: FastifyZodProvider) => {
  // Authenticated by the session token alone, which inject-identity skips for this path: the CLI holds no
  // other credential when it starts an agent from a `--session-token`.
  server.route({
    method: "GET",
    url: "/skills",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listAgentVaultSessionSkills",
      description:
        "Get the files of every skill an agent in a session should have: the latest version of each skill on the session's access bundle, and the built-in infisical-agent-vault skill, ordered by name. Authenticate with the session token as `Authorization: Bearer agv_...`. Use it to install skills where an agent runs without `infisical agent-vault run`, such as in a sandbox you create from code.",
      tags: [ApiDocsTags.AgentVaultSkills],
      querystring: z.object({
        includeBuiltin: z
          .enum(["true", "false"])
          .transform((value) => value === "true")
          .default("true")
          .describe(AGENT_VAULT.SKILL.includeBuiltin)
      }),
      response: {
        200: z.object({
          skills: SessionSkillSchema.array().describe(AGENT_VAULT.SKILL.sessionSkills)
        })
      }
    },
    handler: async (req) => {
      const authorization = SessionTokenAuthorizationSchema.safeParse(req.headers.authorization);
      if (!authorization.success) {
        throw new UnauthorizedError({
          message: "Send an Agent Vault session token in the Authorization header, as 'Bearer agv_...'."
        });
      }

      const {
        skills: reachableSkills,
        session,
        ownerUser,
        onBehalfOfUser,
        orgId
      } = await server.services.agentVaultProxy.getSessionSkills({
        sessionToken: authorization.data
      });
      const builtin = req.query.includeBuiltin ? await getAgentVaultBuiltinSkillOrNull() : null;
      // The built-in skill is delivered in place of a library skill created under its name before it was reserved.
      // It isn't audited or counted below: it holds no project data, and every session would otherwise record it.
      const skills = builtin ? reachableSkills.filter((skill) => skill.name !== builtin.name) : reachableSkills;

      const actor = sessionOwnerActor(session, ownerUser);
      if (skills.length > 0) {
        // A session carries one access bundle today, so every skill is credited to the same one.
        const [{ accessBundleId, accessBundleName }] = skills;
        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          actor,
          orgId,
          projectId: session.projectId,
          event: {
            type: EventType.AGENT_VAULT_SKILLS_DELIVERED,
            metadata: {
              sessionId: session.id,
              accessBundleId,
              accessBundleName,
              skills: skills.map((skill) => ({
                skillId: skill.id,
                skillName: skill.name,
                version: skill.version,
                sha256: skill.sha256
              })),
              ...(onBehalfOfUser && {
                ...(onBehalfOfUser.id && { onBehalfOfUserId: onBehalfOfUser.id }),
                onBehalfOfUserName: onBehalfOfUser.username,
                ...(onBehalfOfUser.email && { onBehalfOfUserEmail: onBehalfOfUser.email })
              })
            }
          }
        });

        void server.services.telemetry
          .sendPostHogEvents({
            event: PostHogEventTypes.AgentVaultSkillsDelivered,
            distinctId: `agent-vault-session-${session.id}`,
            organizationId: orgId,
            anonymous: true,
            properties: {
              orgId,
              channel: req.auditLogInfo.userAgentType ?? UserAgentType.OTHER,
              actorType: actor.type,
              skillCount: skills.length
            }
          })
          .catch(() => {});
      }

      const delivered = skills.map(({ id, name, version, sha256, files }) => ({
        id,
        name,
        version,
        sha256,
        files,
        isBuiltin: false
      }));
      if (builtin) {
        const { id, name, version, sha256, files } = builtin;
        delivered.push({ id, name, version, sha256, files, isBuiltin: true });
      }
      return { skills: delivered.sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name))) };
    }
  });

  // Authenticated by the session token alone, like the skills above. A proxy forwards an agent's request here with the
  // session's own token and names itself, so the list can say how that proxy treats hosts no service covers.
  server.route({
    method: "GET",
    url: "/services",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listAgentVaultSessionServices",
      description:
        "List the services a session can use: what each one is for, the hosts or server it covers, what the proxy adds to requests, what it allows, and how an agent calls it. Never a credential or a value the proxy fills in. Authenticate with the session token as `Authorization: Bearer agv_...`. Through its proxy, an agent reaches this list at the same path on the proxy's Infisical with no token of its own; `infisical agent-vault run` sets `INFISICAL_AGENT_VAULT_URL` to that Infisical's URL, such as `https://app.infisical.com`.",
      tags: [ApiDocsTags.AgentVaultSessions],
      response: {
        200: z.object({
          agentVault: z
            .object({
              proxy: z.string().nullable().describe(AGENT_VAULT.SESSION_SERVICES.proxyName),
              version: z.string().nullable().describe(AGENT_VAULT.SESSION_SERVICES.proxyVersion),
              trafficPolicy: z
                .enum(["any-host", "service-hosts"])
                .nullable()
                .describe(AGENT_VAULT.SESSION_SERVICES.trafficPolicy)
            })
            .describe(AGENT_VAULT.SESSION_SERVICES.agentVault),
          session: z
            .object({
              expiresAt: z.string().nullable().describe(AGENT_VAULT.SESSION_SERVICES.sessionExpiresAt),
              accessBundle: z.string().nullable().describe(AGENT_VAULT.SESSION_SERVICES.sessionAccessBundle)
            })
            .describe(AGENT_VAULT.SESSION_SERVICES.session),
          services: SessionServiceSchema.array().describe(AGENT_VAULT.SESSION_SERVICES.services),
          notes: z.string().array().describe(AGENT_VAULT.SESSION_SERVICES.notes)
        })
      }
    },
    handler: async (req) => {
      const authorization = SessionTokenAuthorizationSchema.safeParse(req.headers.authorization);
      if (!authorization.success) {
        throw new UnauthorizedError({
          message: "Send an Agent Vault session token in the Authorization header, as 'Bearer agv_...'."
        });
      }

      const proxyId = ProxyIdHeaderSchema.safeParse(req.headers["x-agent-vault-proxy-id"]);
      const proxyVersion = ProxyVersionHeaderSchema.safeParse(req.headers["x-agent-vault-proxy-version"]);
      return server.services.agentVaultProxy.getSessionServices({
        sessionToken: authorization.data,
        proxyId: proxyId.success ? proxyId.data : undefined,
        proxyVersion: proxyVersion.success ? proxyVersion.data : undefined
      });
    }
  });

  // Ends the session the token belongs to, like Vault's token revoke. The same token-only auth as /skills, so a
  // script that minted a session can end it without keeping its id.
  server.route({
    method: "POST",
    url: "/revoke",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "revokeAgentVaultSessionByToken",
      description:
        "Revoke the Agent Vault session that the token belongs to. Authenticate with the session token as `Authorization: Bearer agv_...`.",
      tags: [ApiDocsTags.AgentVaultSessions],
      response: {
        200: z.object({
          session: z.object({
            id: z.string().uuid().describe(AGENT_VAULT.SESSION.sessionId),
            revokedAt: z.date().nullable().describe(AGENT_VAULT.SESSION.revokedAt)
          })
        })
      }
    },
    handler: async (req) => {
      const authorization = SessionTokenAuthorizationSchema.safeParse(req.headers.authorization);
      if (!authorization.success) {
        throw new UnauthorizedError({
          message: "Send an Agent Vault session token in the Authorization header, as 'Bearer agv_...'."
        });
      }

      const { session, revokedNow, ownerUser, auditDescription, orgId } =
        await server.services.agentVaultProxy.revokeSessionByToken({
          sessionToken: authorization.data
        });

      if (revokedNow) {
        const actor = sessionOwnerActor(session, ownerUser);
        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          actor,
          orgId,
          projectId: session.projectId,
          event: {
            type: EventType.AGENT_VAULT_SESSION_REVOKE,
            metadata: {
              sessionId: session.id,
              label: session.label ?? null,
              revokedWithToken: true,
              ...auditDescription
            }
          }
        });

        void server.services.telemetry
          .sendPostHogEvents({
            event: PostHogEventTypes.AgentVaultSessionRevoked,
            distinctId: `agent-vault-session-${session.id}`,
            organizationId: orgId,
            anonymous: true,
            properties: {
              orgId,
              channel: req.auditLogInfo.userAgentType ?? UserAgentType.OTHER,
              actorType: actor.type,
              sessionId: session.id
            }
          })
          .catch(() => {});
      }

      return { session: { id: session.id, revokedAt: session.revokedAt ?? null } };
    }
  });
};
