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

// Mirrors PAM's MemberResultSchema so every membership write reports the row it touched.
const MemberResultSchema = z.object({
  membershipId: z.string().uuid(),
  userId: z.string().uuid().optional().describe(AGENT_VAULT.MEMBER.userId),
  identityId: z.string().uuid().optional().describe(AGENT_VAULT.MEMBER.identityId),
  groupId: z.string().uuid().optional().describe(AGENT_VAULT.MEMBER.groupId),
  role: z.string().describe(AGENT_VAULT.MEMBERSHIP.role),
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
      response: {
        200: z.object({
          members: MemberSchema.extend({
            email: z.string().nullable(),
            username: z.string(),
            firstName: z.string().nullable(),
            lastName: z.string().nullable(),
            isOrgMembershipPending: z.boolean()
          }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => ({
      members: await server.services.agentVaultMembership.listProductUserMembers({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req)
      })
    })
  });
  server.route({
    method: "GET",
    url: "/groups",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "listAgentVaultProductGroupMembers",
      description: "List the groups that are members of Agent Vault",
      tags: [ApiDocsTags.AgentVaultMemberships],
      response: { 200: z.object({ members: MemberSchema.extend({ name: z.string() }).array() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => ({
      members: await server.services.agentVaultMembership.listProductGroupMembers({
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
          members: MemberSchema.extend({
            name: z.string(),
            identityProjectId: z.string().nullable(),
            identityOrgId: z.string().nullable()
          }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => ({
      members: await server.services.agentVaultMembership.listProductIdentityMembers({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req)
      })
    })
  });
  server.route({
    method: "POST",
    url: "/users",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "addAgentVaultProductUserMembers",
      description: "Give one or more users access to Agent Vault, by id or by email",
      tags: [ApiDocsTags.AgentVaultMemberships],
      body: z
        .object({
          userIds: z.string().uuid().array().max(100).default([]),
          // Usernames are stored lowercase and the lookup is an exact match, so a mixed-case address
          // would come back as "not a member" rather than resolving.
          emails: z
            .string()
            .email()
            .array()
            .max(100)
            .default([])
            .refine((val) => val.every((el) => el === el.toLowerCase()), "Email must be lowercase"),
          role: ProductRoleSchema
        })
        .refine((val) => val.userIds.length + val.emails.length > 0, {
          message: "Provide at least one userId or email."
        }),
      response: { 200: z.object({ members: MemberResultSchema.array(), skipped: z.string().array() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { memberships, skipped } = await server.services.agentVaultMembership.addProductUserMembers({
        projectId: req.internalAgentVaultProjectId,
        ...req.body,
        ctx: actorContext(req)
      });

      await Promise.all(
        memberships.map((membership) =>
          server.services.auditLog.createAuditLog({
            ...req.auditLogInfo,
            orgId: req.permission.orgId,
            projectId: req.internalAgentVaultProjectId,
            event: {
              type: EventType.AGENT_VAULT_PRODUCT_MEMBER_ADD,
              metadata: { userId: membership.userId, userName: membership.userName, role: membership.role }
            }
          })
        )
      );

      return { members: memberships, skipped };
    }
  });

  server.route({
    method: "PATCH",
    url: "/users/:userId",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "updateAgentVaultProductUserMemberRole",
      description: "Change a user's Agent Vault role",
      tags: [ApiDocsTags.AgentVaultMemberships],
      params: z.object({ userId: z.string().uuid().describe(AGENT_VAULT.MEMBER.userId) }),
      body: z.object({ role: ProductRoleSchema }),
      response: { 200: MemberResultSchema.omit({ createdAt: true }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const member = await server.services.agentVaultMembership.updateProductMemberRole({
        projectId: req.internalAgentVaultProjectId,
        userId: req.params.userId,
        role: req.body.role,
        ctx: actorContext(req)
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_PRODUCT_MEMBER_UPDATE,
          metadata: {
            userId: req.params.userId,
            userName: member.userName,
            role: req.body.role
          }
        }
      });

      return member;
    }
  });

  server.route({
    method: "DELETE",
    url: "/users/:userId",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "removeAgentVaultProductUserMember",
      description: "Remove a user from Agent Vault, and with it every bundle they hold",
      tags: [ApiDocsTags.AgentVaultMemberships],
      params: z.object({ userId: z.string().uuid().describe(AGENT_VAULT.MEMBER.userId) }),
      response: { 200: MemberResultSchema.pick({ membershipId: true, userId: true }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const removed = await server.services.agentVaultMembership.removeProductMember({
        projectId: req.internalAgentVaultProjectId,
        userId: req.params.userId,
        ctx: actorContext(req)
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_PRODUCT_MEMBER_REMOVE,
          metadata: { userId: req.params.userId, userName: removed.userName }
        }
      });

      return { membershipId: removed.membershipId, userId: req.params.userId };
    }
  });

  server.route({
    method: "POST",
    url: "/groups/:groupId",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "addAgentVaultProductGroupMember",
      description: "Give a group access to Agent Vault",
      tags: [ApiDocsTags.AgentVaultMemberships],
      params: z.object({ groupId: z.string().uuid().describe(AGENT_VAULT.MEMBER.groupId) }),
      body: z.object({ role: ProductRoleSchema }),
      response: { 200: MemberResultSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const member = await server.services.agentVaultMembership.addProductMember({
        projectId: req.internalAgentVaultProjectId,
        groupId: req.params.groupId,
        role: req.body.role,
        ctx: actorContext(req)
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_PRODUCT_MEMBER_ADD,
          metadata: {
            groupId: req.params.groupId,
            groupName: member.groupName,
            role: req.body.role
          }
        }
      });

      return member;
    }
  });

  server.route({
    method: "PATCH",
    url: "/groups/:groupId",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "updateAgentVaultProductGroupMemberRole",
      description: "Change a group's Agent Vault role",
      tags: [ApiDocsTags.AgentVaultMemberships],
      params: z.object({ groupId: z.string().uuid().describe(AGENT_VAULT.MEMBER.groupId) }),
      body: z.object({ role: ProductRoleSchema }),
      response: { 200: MemberResultSchema.omit({ createdAt: true }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const member = await server.services.agentVaultMembership.updateProductMemberRole({
        projectId: req.internalAgentVaultProjectId,
        groupId: req.params.groupId,
        role: req.body.role,
        ctx: actorContext(req)
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_PRODUCT_MEMBER_UPDATE,
          metadata: {
            groupId: req.params.groupId,
            groupName: member.groupName,
            role: req.body.role
          }
        }
      });

      return member;
    }
  });

  server.route({
    method: "DELETE",
    url: "/groups/:groupId",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "removeAgentVaultProductGroupMember",
      description: "Remove a group from Agent Vault, and with it every bundle they hold",
      tags: [ApiDocsTags.AgentVaultMemberships],
      params: z.object({ groupId: z.string().uuid().describe(AGENT_VAULT.MEMBER.groupId) }),
      response: { 200: MemberResultSchema.pick({ membershipId: true, groupId: true }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const removed = await server.services.agentVaultMembership.removeProductMember({
        projectId: req.internalAgentVaultProjectId,
        groupId: req.params.groupId,
        ctx: actorContext(req)
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_PRODUCT_MEMBER_REMOVE,
          metadata: { groupId: req.params.groupId, groupName: removed.groupName }
        }
      });

      return { membershipId: removed.membershipId, groupId: req.params.groupId };
    }
  });

  server.route({
    method: "POST",
    url: "/identities/:identityId",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "addAgentVaultProductIdentityMember",
      description: "Give a machine identity access to Agent Vault",
      tags: [ApiDocsTags.AgentVaultMemberships],
      params: z.object({ identityId: z.string().uuid().describe(AGENT_VAULT.MEMBER.identityId) }),
      body: z.object({ role: ProductRoleSchema }),
      response: { 200: MemberResultSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const member = await server.services.agentVaultMembership.addProductMember({
        projectId: req.internalAgentVaultProjectId,
        identityId: req.params.identityId,
        role: req.body.role,
        ctx: actorContext(req)
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_PRODUCT_MEMBER_ADD,
          metadata: {
            identityId: req.params.identityId,
            identityName: member.identityName,
            role: req.body.role
          }
        }
      });

      return member;
    }
  });

  server.route({
    method: "PATCH",
    url: "/identities/:identityId",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "updateAgentVaultProductIdentityMemberRole",
      description: "Change a machine identity's Agent Vault role",
      tags: [ApiDocsTags.AgentVaultMemberships],
      params: z.object({ identityId: z.string().uuid().describe(AGENT_VAULT.MEMBER.identityId) }),
      body: z.object({ role: ProductRoleSchema }),
      response: { 200: MemberResultSchema.omit({ createdAt: true }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const member = await server.services.agentVaultMembership.updateProductMemberRole({
        projectId: req.internalAgentVaultProjectId,
        identityId: req.params.identityId,
        role: req.body.role,
        ctx: actorContext(req)
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_PRODUCT_MEMBER_UPDATE,
          metadata: {
            identityId: req.params.identityId,
            identityName: member.identityName,
            role: req.body.role
          }
        }
      });

      return member;
    }
  });

  server.route({
    method: "DELETE",
    url: "/identities/:identityId",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "removeAgentVaultProductIdentityMember",
      description: "Remove a machine identity from Agent Vault, and with it every bundle they hold",
      tags: [ApiDocsTags.AgentVaultMemberships],
      params: z.object({ identityId: z.string().uuid().describe(AGENT_VAULT.MEMBER.identityId) }),
      response: { 200: MemberResultSchema.pick({ membershipId: true, identityId: true }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const removed = await server.services.agentVaultMembership.removeProductMember({
        projectId: req.internalAgentVaultProjectId,
        identityId: req.params.identityId,
        ctx: actorContext(req)
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_PRODUCT_MEMBER_REMOVE,
          metadata: { identityId: req.params.identityId, identityName: removed.identityName }
        }
      });

      return { membershipId: removed.membershipId, identityId: req.params.identityId };
    }
  });
};
