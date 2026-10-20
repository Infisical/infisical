import { z } from "zod";

import { AgentVaultDelegationScope } from "@app/ee/services/agent-vault/agent-vault-enums";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { AGENT_VAULT } from "@app/lib/api-docs";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

import { actorContext } from "./agent-vault-router-fns";

const MAX_DELEGATION_SUBJECTS = 100;

// Without an example, the docs show all-members, the first value, next to users and groups, which only a selected
// delegation names.
const DelegationScopeSchema = z
  .nativeEnum(AgentVaultDelegationScope)
  .describe(JSON.stringify({ description: AGENT_VAULT.DELEGATION.scope, example: AgentVaultDelegationScope.Selected }));

const DelegationUserSchema = z.object({
  id: z.string().uuid().describe(AGENT_VAULT.DELEGATION.userId),
  username: z.string().describe(AGENT_VAULT.DELEGATION.username),
  email: z.string().nullable().describe(AGENT_VAULT.DELEGATION.email),
  firstName: z.string().nullable().describe(AGENT_VAULT.DELEGATION.firstName),
  lastName: z.string().nullable().describe(AGENT_VAULT.DELEGATION.lastName),
  addedAt: z.date().describe(AGENT_VAULT.DELEGATION.addedAt)
});

const DelegationGroupSchema = z.object({
  id: z.string().uuid().describe(AGENT_VAULT.DELEGATION.groupId),
  name: z.string().describe(AGENT_VAULT.DELEGATION.groupName),
  addedAt: z.date().describe(AGENT_VAULT.DELEGATION.addedAt)
});

const DelegationSchema = z.object({
  machineIdentity: z
    .object({
      id: z.string().uuid().describe(AGENT_VAULT.DELEGATION.machineIdentityId),
      name: z.string().describe(AGENT_VAULT.DELEGATION.machineIdentityName)
    })
    .describe(AGENT_VAULT.DELEGATION.machineIdentity),
  scope: DelegationScopeSchema,
  users: DelegationUserSchema.array().describe(AGENT_VAULT.DELEGATION.users),
  groups: DelegationGroupSchema.array().describe(AGENT_VAULT.DELEGATION.groups),
  createdAt: z.date(),
  updatedAt: z.date()
});

const missingAccessBundlesSchema = (description: string) =>
  z
    .object({
      id: z.string().uuid().describe(AGENT_VAULT.DELEGATION.accessBundleId),
      name: z.string().describe(AGENT_VAULT.DELEGATION.accessBundleName)
    })
    .array()
    .describe(description);

// Only one delegation at a time says which bundles its machine identity can't act on: working that out reads the
// access of every user it covers, too much for a list.
const DelegationDetailSchema = DelegationSchema.extend({
  users: DelegationUserSchema.extend({
    missingAccessBundles: missingAccessBundlesSchema(AGENT_VAULT.DELEGATION.userMissingAccessBundles)
  })
    .array()
    .describe(AGENT_VAULT.DELEGATION.users),
  groups: DelegationGroupSchema.extend({
    missingAccessBundles: missingAccessBundlesSchema(AGENT_VAULT.DELEGATION.groupMissingAccessBundles)
  })
    .array()
    .describe(AGENT_VAULT.DELEGATION.groups),
  missingAccessBundles: missingAccessBundlesSchema(AGENT_VAULT.DELEGATION.missingAccessBundles)
});

const machineIdentityParams = z.object({
  machineIdentityId: z.string().uuid().describe(AGENT_VAULT.DELEGATION.machineIdentityId)
});

const auditDelegationFields = (delegation: z.infer<typeof DelegationSchema>) => ({
  machineIdentityId: delegation.machineIdentity.id,
  machineIdentityName: delegation.machineIdentity.name
});

// None of these accept AuthMode.OAUTH. The admin check reads the role, which a delegated token's scopes don't narrow,
// and a delegation lets an identity act as other users, which no third-party application should be able to grant.
export const registerAgentVaultDelegationRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listAgentVaultDelegations",
      description: "List the machine identities that can start Agent Vault sessions on behalf of users",
      tags: [ApiDocsTags.AgentVaultDelegations],
      querystring: z.object({
        machineIdentityIds: z
          .string()
          .trim()
          .max(100 * 37)
          .optional()
          .transform((val) => (val ? [...new Set(val.split(",").map((id) => id.trim()))] : undefined))
          .pipe(z.string().uuid().array().max(100).optional())
          .describe(AGENT_VAULT.DELEGATION.machineIdentityIds),
        limit: z.coerce.number().int().min(1).max(100).default(100).describe(AGENT_VAULT.DELEGATION.limit),
        offset: z.coerce.number().int().min(0).max(10000).default(0).describe(AGENT_VAULT.DELEGATION.offset)
      }),
      response: {
        200: z.object({ delegations: DelegationSchema.array(), totalCount: z.number() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) =>
      server.services.agentVaultDelegation.listDelegations({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        ...req.query
      })
  });

  server.route({
    method: "GET",
    url: "/:machineIdentityId",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "getAgentVaultDelegation",
      description:
        "Get which users a machine identity can start Agent Vault sessions on behalf of. A machine identity can read its own.",
      tags: [ApiDocsTags.AgentVaultDelegations],
      params: machineIdentityParams,
      response: { 200: z.object({ delegation: DelegationDetailSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) =>
      server.services.agentVaultDelegation.getDelegation({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        machineIdentityId: req.params.machineIdentityId
      })
  });

  server.route({
    method: "PUT",
    url: "/:machineIdentityId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "setAgentVaultDelegation",
      description:
        "Set which users a machine identity can start Agent Vault sessions on behalf of, replacing any delegation it has",
      tags: [ApiDocsTags.AgentVaultDelegations],
      params: machineIdentityParams,
      body: z
        .object({
          scope: DelegationScopeSchema,
          // Without examples, the docs show both lists empty, which a selected delegation can't be.
          userIds: z
            .string()
            .uuid()
            .array()
            .max(MAX_DELEGATION_SUBJECTS)
            .default([])
            .transform((ids) => [...new Set(ids)])
            .describe(
              JSON.stringify({
                description: AGENT_VAULT.DELEGATION.userIds,
                example: ["3c90c3cc-0d44-4b50-8888-8dd25736052a"]
              })
            ),
          groupIds: z
            .string()
            .uuid()
            .array()
            .max(MAX_DELEGATION_SUBJECTS)
            .default([])
            .transform((ids) => [...new Set(ids)])
            .describe(
              JSON.stringify({
                description: AGENT_VAULT.DELEGATION.groupIds,
                example: ["7b1e4f2a-9c3d-4a6b-8e5f-1d2c3b4a5e6f"]
              })
            )
        })
        .superRefine((val, ctx) => {
          const named = val.userIds.length + val.groupIds.length;
          if (val.scope === AgentVaultDelegationScope.AllMembers && named) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message:
                "A delegation to all members names no users or groups. Remove them, or set the scope to selected."
            });
          }
          if (val.scope === AgentVaultDelegationScope.Selected && !named) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Name at least one user or group, or set the scope to all-members."
            });
          }
        }),
      response: { 200: z.object({ delegation: DelegationDetailSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { delegation } = await server.services.agentVaultDelegation.setDelegation({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        machineIdentityId: req.params.machineIdentityId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_DELEGATION_SET,
          metadata: {
            ...auditDelegationFields(delegation),
            scope: delegation.scope,
            users: delegation.users.map((user) => ({ userId: user.id, userName: user.username })),
            groups: delegation.groups.map((group) => ({ groupId: group.id, groupName: group.name }))
          }
        }
      });

      return { delegation };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:machineIdentityId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "deleteAgentVaultDelegation",
      description:
        "Stop a machine identity from starting Agent Vault sessions on behalf of users. Sessions it already started stop working.",
      tags: [ApiDocsTags.AgentVaultDelegations],
      params: machineIdentityParams,
      response: { 200: z.object({ delegation: DelegationSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { delegation } = await server.services.agentVaultDelegation.deleteDelegation({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        machineIdentityId: req.params.machineIdentityId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_DELEGATION_DELETE,
          metadata: auditDelegationFields(delegation)
        }
      });

      return { delegation };
    }
  });
};
