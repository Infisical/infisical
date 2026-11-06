import { z } from "zod";

import { auditActorFields } from "@app/ee/services/agent-vault/agent-vault-actor-name-fns";
import { AgentVaultMemberType } from "@app/ee/services/agent-vault/agent-vault-enums";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { AGENT_VAULT } from "@app/lib/api-docs";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { emitAgentVaultTelemetry } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { actorContext, resolveRequestedProjectId } from "./agent-vault-router-fns";
import {
  AgentVaultActorRefSchema,
  agentVaultListQuery,
  AgentVaultProductActorSchema,
  AgentVaultProductMemberAddSchema,
  AgentVaultProductMemberIdsSchema,
  AgentVaultProductMemberRefSchema,
  AgentVaultProductMemberRoleUpdateSchema,
  AgentVaultProductMemberSchema,
  AgentVaultProjectIdSchema,
  AgentVaultSkippedActorSchema
} from "./agent-vault-schemas";

export const registerAgentVaultMembershipRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listAgentVaultMembers",
      description: "List the users, groups and machine identities that are members of an Agent Vault project",
      tags: [ApiDocsTags.AgentVaultMembers],
      querystring: z.object({
        projectId: AgentVaultProjectIdSchema,
        actorType: z.nativeEnum(AgentVaultMemberType).optional().describe(AGENT_VAULT.MEMBERSHIP.actorTypeFilter),
        ...agentVaultListQuery(AGENT_VAULT.MEMBERSHIP)
      }),
      response: {
        200: z.object({ members: AgentVaultProductMemberSchema.array(), totalCount: z.number() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { projectId: requestedProjectId, ...query } = req.query;
      const projectId = await resolveRequestedProjectId(req, requestedProjectId, "query");
      return server.services.agentVaultMembership.listProductMembers({
        projectId,
        ...query,
        ctx: actorContext(req)
      });
    }
  });

  server.route({
    method: "GET",
    url: "/available",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listAvailableAgentVaultMembers",
      description:
        "List the users, groups and machine identities in the organization that can be added to an Agent Vault project",
      tags: [ApiDocsTags.AgentVaultMembers],
      querystring: z.object({
        projectId: AgentVaultProjectIdSchema,
        actorType: z.nativeEnum(AgentVaultMemberType).optional().describe(AGENT_VAULT.AVAILABLE_MEMBER.actorTypeFilter),
        ...agentVaultListQuery(AGENT_VAULT.AVAILABLE_MEMBER)
      }),
      response: {
        200: z.object({ actors: AgentVaultProductActorSchema.array(), totalCount: z.number() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { projectId: requestedProjectId, ...query } = req.query;
      const projectId = await resolveRequestedProjectId(req, requestedProjectId, "query");
      return server.services.agentVaultMembership.listAvailableProductMembers({
        projectId,
        ...query,
        ctx: actorContext(req)
      });
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "addAgentVaultMembers",
      description:
        "Give users, groups and machine identities access to an Agent Vault project, by id, email or username",
      tags: [ApiDocsTags.AgentVaultMembers],
      body: AgentVaultProductMemberAddSchema.and(z.object({ projectId: AgentVaultProjectIdSchema })),
      response: {
        200: z.object({
          members: AgentVaultProductMemberRefSchema.array(),
          skipped: AgentVaultSkippedActorSchema.array().describe(AGENT_VAULT.MEMBERSHIP.addSkipped)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { projectId: requestedProjectId, ...body } = req.body;
      const projectId = await resolveRequestedProjectId(req, requestedProjectId, "body");
      const { members, skipped } = await server.services.agentVaultMembership.addProductMembers({
        projectId,
        ...body,
        ctx: actorContext(req)
      });

      await Promise.all(
        members.map((member) =>
          server.services.auditLog.createAuditLog({
            ...req.auditLogInfo,
            orgId: req.permission.orgId,
            projectId,
            event: {
              type: EventType.AGENT_VAULT_MEMBER_ADD,
              metadata: {
                ...auditActorFields(member),
                role: member.role
              }
            }
          })
        )
      );

      members.forEach((member) =>
        emitAgentVaultTelemetry(server.services.telemetry, req, {
          event: PostHogEventTypes.AgentVaultProductMemberAdded,
          properties: { memberType: member.type, role: member.role }
        })
      );

      return { members, skipped };
    }
  });

  server.route({
    method: "PATCH",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "updateAgentVaultMemberRoles",
      description:
        "Change the Agent Vault role of users, groups and machine identities. Name each one by ID; to add users by email or username, use Add members.",
      tags: [ApiDocsTags.AgentVaultMembers],
      body: AgentVaultProductMemberRoleUpdateSchema.and(z.object({ projectId: AgentVaultProjectIdSchema })),
      response: {
        200: z.object({
          members: AgentVaultProductMemberRefSchema.array(),
          skipped: AgentVaultActorRefSchema.array().describe(AGENT_VAULT.MEMBERSHIP.updateSkipped)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { projectId: requestedProjectId, ...body } = req.body;
      const projectId = await resolveRequestedProjectId(req, requestedProjectId, "body");
      const { members, skipped } = await server.services.agentVaultMembership.updateProductMemberRoles({
        projectId,
        ...body,
        ctx: actorContext(req)
      });

      await Promise.all(
        members.map((member) =>
          server.services.auditLog.createAuditLog({
            ...req.auditLogInfo,
            orgId: req.permission.orgId,
            projectId,
            event: {
              type: EventType.AGENT_VAULT_MEMBER_UPDATE,
              metadata: {
                ...auditActorFields(member),
                role: member.role
              }
            }
          })
        )
      );

      members.forEach((member) =>
        emitAgentVaultTelemetry(server.services.telemetry, req, {
          event: PostHogEventTypes.AgentVaultProductMemberUpdated,
          properties: { memberType: member.type, role: member.role }
        })
      );

      return { members, skipped };
    }
  });

  server.route({
    method: "DELETE",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "revokeAgentVaultMembers",
      description: "Remove members from an Agent Vault project, and with them every bundle they hold",
      tags: [ApiDocsTags.AgentVaultMembers],
      body: AgentVaultProductMemberIdsSchema.and(z.object({ projectId: AgentVaultProjectIdSchema })),
      response: {
        200: z.object({
          members: AgentVaultActorRefSchema.array(),
          skipped: AgentVaultActorRefSchema.array().describe(AGENT_VAULT.MEMBERSHIP.revokeSkipped)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { projectId: requestedProjectId, ...body } = req.body;
      const projectId = await resolveRequestedProjectId(req, requestedProjectId, "body");
      const { members, skipped } = await server.services.agentVaultMembership.revokeProductMembers({
        projectId,
        ...body,
        ctx: actorContext(req)
      });

      await Promise.all(
        members.map((member) =>
          server.services.auditLog.createAuditLog({
            ...req.auditLogInfo,
            orgId: req.permission.orgId,
            projectId,
            event: {
              type: EventType.AGENT_VAULT_MEMBER_REMOVE,
              metadata: {
                ...auditActorFields(member)
              }
            }
          })
        )
      );

      members.forEach((member) =>
        emitAgentVaultTelemetry(server.services.telemetry, req, {
          event: PostHogEventTypes.AgentVaultProductMemberRemoved,
          properties: { memberType: member.type }
        })
      );

      return { members, skipped };
    }
  });
};
