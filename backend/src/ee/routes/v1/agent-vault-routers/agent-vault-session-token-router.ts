import { z } from "zod";

import { TAgentVaultSessions } from "@app/db/schemas";
import { AGENT_VAULT_SESSION_TOKEN_PREFIX } from "@app/ee/services/agent-vault-session/agent-vault-session-fns";
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
  files: AgentVaultSkillFilesResponseSchema
});

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
      hide: true,
      operationId: "listAgentVaultSessionSkills",
      description:
        "Get the latest files of every skill on the calling session's access bundles, ordered by name. Authenticate with the session token as `Authorization: Bearer agv_...`. Called once when an agent starts.",
      tags: [ApiDocsTags.AgentVaultSkills],
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

      const { skills, session, ownerUser, onBehalfOfUser, orgId } =
        await server.services.agentVaultProxy.getSessionSkills({
          sessionToken: authorization.data
        });

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

      return {
        skills: skills.map(({ id, name, version, sha256, files }) => ({ id, name, version, sha256, files }))
      };
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
