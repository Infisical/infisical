import { FastifyRequest } from "fastify";
import { z } from "zod";

import { ProjectMembershipRole } from "@app/db/schemas";

import { TAgentVaultActorContext } from "@app/ee/services/agent-vault/agent-vault-actor-types";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { AGENT_VAULT } from "@app/lib/api-docs";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const actorContext = (req: FastifyRequest): TAgentVaultActorContext => ({
  actorId: req.permission.id,
  actor: req.permission.type,
  actorOrgId: req.permission.orgId,
  actorAuthMethod: req.permission.authMethod
});

const ProductRoleSchema = z
  .enum([ProjectMembershipRole.Admin, ProjectMembershipRole.Member])
  .describe(AGENT_VAULT.MEMBERSHIP.role);

const MemberSchema = z.object({
  membershipId: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  groupId: z.string().uuid().nullable(),
  identityId: z.string().uuid().nullable(),
  role: z.string().describe(AGENT_VAULT.MEMBERSHIP.role),
  isActive: z.boolean(),
  createdAt: z.date()
});

export const registerAgentVaultMembershipRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/users",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "listAgentVaultProductUserMembers",
      description: "List the users that are members of Agent Vault",
      tags: [ApiDocsTags.AgentVaultMemberships],
      response: { 200: z.object({ members: MemberSchema.array() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const all = await server.services.agentVaultMembership.listProductMembers({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req)
      });
      return { members: all.filter((m) => m.userId) };
    }
  });

  server.route({
    method: "GET",
    url: "/groups",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "listAgentVaultProductGroupMembers",
      description: "List the groups that are members of Agent Vault",
      tags: [ApiDocsTags.AgentVaultMemberships],
      response: { 200: z.object({ members: MemberSchema.array() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const all = await server.services.agentVaultMembership.listProductMembers({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req)
      });
      return { members: all.filter((m) => m.groupId) };
    }
  });

  server.route({
    method: "GET",
    url: "/identity-members",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "listAgentVaultProductIdentityMembers",
      description: "List the machine identities that are members of Agent Vault, with their names",
      tags: [ApiDocsTags.AgentVaultMemberships],
      response: { 200: z.object({ members: MemberSchema.extend({ name: z.string() }).array() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => ({
      members: await server.services.agentVaultMembership.listProductIdentityMembers({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req)
      })
    })
  });
  server.route({
    method: "GET",
    url: "/identities",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "listAgentVaultProductIdentityMembers",
      description: "List the machine identities that are members of Agent Vault",
      tags: [ApiDocsTags.AgentVaultMemberships],
      response: {
        200: z.object({
          identities: z
            .object({
              id: z.string().uuid().describe(AGENT_VAULT.MEMBER.identityId),
              name: z.string().describe(AGENT_VAULT.MEMBERSHIP.identityName)
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const identities = await server.services.agentVaultMembership.listProductIdentities({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req)
      });
      return { identities };
    }
  });

  const actorBody = z.object({
    userId: z.string().uuid().optional().describe(AGENT_VAULT.MEMBER.userId),
    groupId: z.string().uuid().optional().describe(AGENT_VAULT.MEMBER.groupId),
    identityId: z.string().uuid().optional().describe(AGENT_VAULT.MEMBER.identityId)
  });

  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "addAgentVaultProductMember",
      description: "Give a user, group or machine identity access to Agent Vault",
      tags: [ApiDocsTags.AgentVaultMemberships],
      body: actorBody.extend({ role: ProductRoleSchema }),
      response: { 200: z.object({ membershipId: z.string().uuid(), role: z.string() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const member = await server.services.agentVaultMembership.addProductMember({
        projectId: req.internalAgentVaultProjectId,
        ...req.body,
        ctx: actorContext(req)
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_PRODUCT_MEMBER_ADD,
          metadata: {
            userId: req.body.userId,
            groupId: req.body.groupId,
            identityId: req.body.identityId,
            role: req.body.role
          }
        }
      });

      return { membershipId: member.membershipId, role: member.role };
    }
  });

  server.route({
    method: "PATCH",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "updateAgentVaultProductMemberRole",
      description: "Change the Agent Vault role of a user, group or machine identity",
      tags: [ApiDocsTags.AgentVaultMemberships],
      body: actorBody.extend({ role: ProductRoleSchema }),
      response: { 200: z.object({ membershipId: z.string().uuid(), role: z.string() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const member = await server.services.agentVaultMembership.updateProductMemberRole({
        projectId: req.internalAgentVaultProjectId,
        ...req.body,
        ctx: actorContext(req)
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_PRODUCT_MEMBER_UPDATE,
          metadata: {
            userId: req.body.userId,
            groupId: req.body.groupId,
            identityId: req.body.identityId,
            role: req.body.role
          }
        }
      });

      return { membershipId: member.membershipId, role: member.role };
    }
  });

  server.route({
    method: "DELETE",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "removeAgentVaultProductMember",
      description: "Remove a user, group or machine identity from Agent Vault, and with it every bundle they hold",
      tags: [ApiDocsTags.AgentVaultMemberships],
      body: actorBody,
      response: { 200: z.object({ removed: z.literal(true) }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      await server.services.agentVaultMembership.removeProductMember({
        projectId: req.internalAgentVaultProjectId,
        ...req.body,
        ctx: actorContext(req)
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_PRODUCT_MEMBER_REMOVE,
          metadata: {
            userId: req.body.userId,
            groupId: req.body.groupId,
            identityId: req.body.identityId
          }
        }
      });

      return { removed: true as const };
    }
  });
};
