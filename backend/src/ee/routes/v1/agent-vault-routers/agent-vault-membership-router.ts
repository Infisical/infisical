import { z } from "zod";

import { AgentVaultMemberType } from "@app/ee/services/agent-vault/agent-vault-enums";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { AGENT_VAULT } from "@app/lib/api-docs";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { emitAgentVaultTelemetry } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { actorContext, auditActorFields } from "./agent-vault-router-fns";
import {
  agentVaultListQuery,
  AgentVaultProductMemberAddSchema,
  AgentVaultProductMemberIdsSchema,
  AgentVaultProductMemberRefSchema,
  AgentVaultProductMemberSchema,
  AgentVaultProductRoleSchema,
  AgentVaultSkippedActorSchema
} from "./agent-vault-schemas";

// Plural kebab segments, matching the group routes that publish /machine-identities, so the path stays
// resource-shaped while the JSON says machineIdentity.
const ACTOR_TYPE_SEGMENTS = ["users", "groups", "machine-identities"] as const;

const ACTOR_TYPE_OF: Record<(typeof ACTOR_TYPE_SEGMENTS)[number], AgentVaultMemberType> = {
  users: AgentVaultMemberType.User,
  groups: AgentVaultMemberType.Group,
  "machine-identities": AgentVaultMemberType.MachineIdentity
};

const auditActorNameFields = (actor: { type: AgentVaultMemberType }, actorName?: string) => ({
  ...(actor.type === AgentVaultMemberType.User && { userName: actorName }),
  ...(actor.type === AgentVaultMemberType.MachineIdentity && { machineIdentityName: actorName }),
  ...(actor.type === AgentVaultMemberType.Group && { groupName: actorName })
});

export const registerAgentVaultMembershipRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "listAgentVaultMembers",
      description: "List the users, groups and machine identities that are members of Agent Vault",
      tags: [ApiDocsTags.AgentVaultMembers],
      querystring: z.object({
        actorType: z.nativeEnum(AgentVaultMemberType).optional().describe(AGENT_VAULT.MEMBERSHIP.actorTypeFilter),
        ...agentVaultListQuery(AGENT_VAULT.MEMBERSHIP)
      }),
      response: {
        200: z.object({ members: AgentVaultProductMemberSchema.array(), totalCount: z.number() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) =>
      server.services.agentVaultMembership.listProductMembers({
        projectId: req.internalAgentVaultProjectId,
        ...req.query,
        ctx: actorContext(req)
      })
  });

  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "addAgentVaultMembers",
      description: "Give users, groups and machine identities access to Agent Vault, by id or by email",
      tags: [ApiDocsTags.AgentVaultMembers],
      body: AgentVaultProductMemberAddSchema,
      response: {
        200: z.object({
          members: AgentVaultProductMemberRefSchema.array(),
          skipped: AgentVaultSkippedActorSchema.array().describe(AGENT_VAULT.MEMBERSHIP.addSkipped)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { members, skipped } = await server.services.agentVaultMembership.addProductMembers({
        projectId: req.internalAgentVaultProjectId,
        ...req.body,
        ctx: actorContext(req)
      });

      await Promise.all(
        members.map((member) =>
          server.services.auditLog.createAuditLog({
            ...req.auditLogInfo,
            orgId: req.permission.orgId,
            projectId: req.internalAgentVaultProjectId,
            event: {
              type: EventType.AGENT_VAULT_MEMBER_ADD,
              metadata: {
                ...auditActorFields(member.actor),
                ...auditActorNameFields(member.actor, member.actorName),
                role: member.role
              }
            }
          })
        )
      );

      members.forEach((member) =>
        emitAgentVaultTelemetry(server.services.telemetry, req, {
          event: PostHogEventTypes.AgentVaultProductMemberAdded,
          properties: { memberType: member.actor.type, role: member.role }
        })
      );

      return { members, skipped };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:actorType/:actorId",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "updateAgentVaultMemberRole",
      description: "Change a member's Agent Vault role",
      tags: [ApiDocsTags.AgentVaultMembers],
      params: z.object({
        actorType: z.enum(ACTOR_TYPE_SEGMENTS).describe(AGENT_VAULT.MEMBER.actorType),
        actorId: z.string().uuid().describe(AGENT_VAULT.MEMBER.actorId)
      }),
      body: z.object({ role: AgentVaultProductRoleSchema }),
      response: { 200: z.object({ member: AgentVaultProductMemberRefSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const actor = { type: ACTOR_TYPE_OF[req.params.actorType], id: req.params.actorId };
      const { member } = await server.services.agentVaultMembership.updateProductMemberRole({
        projectId: req.internalAgentVaultProjectId,
        actor,
        role: req.body.role,
        ctx: actorContext(req)
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_MEMBER_UPDATE,
          metadata: {
            ...auditActorFields(member.actor),
            ...auditActorNameFields(member.actor, member.actorName),
            role: member.role
          }
        }
      });

      emitAgentVaultTelemetry(server.services.telemetry, req, {
        event: PostHogEventTypes.AgentVaultProductMemberUpdated,
        properties: { memberType: member.actor.type, role: member.role }
      });

      return { member };
    }
  });

  server.route({
    method: "POST",
    url: "/revoke",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "revokeAgentVaultMembers",
      // A deliberate break from REST, which CODE_QUALITY.md sanctions for a bulk operation that cannot be
      // expressed per resource: DELETE carrying a request body is mangled by enough proxies and clients to
      // be unusable, so removal is a named action on the collection.
      description: "Remove members from Agent Vault, and with them every bundle they hold",
      tags: [ApiDocsTags.AgentVaultMembers],
      body: AgentVaultProductMemberIdsSchema,
      response: {
        200: z.object({
          members: AgentVaultProductMemberRefSchema.omit({ role: true }).array(),
          skipped: AgentVaultSkippedActorSchema.array().describe(AGENT_VAULT.MEMBERSHIP.revokeSkipped)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { members, skipped } = await server.services.agentVaultMembership.revokeProductMembers({
        projectId: req.internalAgentVaultProjectId,
        ...req.body,
        ctx: actorContext(req)
      });

      await Promise.all(
        members.map((member) =>
          server.services.auditLog.createAuditLog({
            ...req.auditLogInfo,
            orgId: req.permission.orgId,
            projectId: req.internalAgentVaultProjectId,
            event: {
              type: EventType.AGENT_VAULT_MEMBER_REMOVE,
              metadata: {
                ...auditActorFields(member.actor),
                ...auditActorNameFields(member.actor, member.actorName)
              }
            }
          })
        )
      );

      members.forEach((member) =>
        emitAgentVaultTelemetry(server.services.telemetry, req, {
          event: PostHogEventTypes.AgentVaultProductMemberRemoved,
          properties: { memberType: member.actor.type }
        })
      );

      return { members, skipped };
    }
  });
};
