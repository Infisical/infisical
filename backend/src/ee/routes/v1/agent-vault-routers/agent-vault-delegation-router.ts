import { z } from "zod";

import { AgentVaultDelegationScope, AgentVaultMemberType } from "@app/ee/services/agent-vault/agent-vault-enums";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { AGENT_VAULT } from "@app/lib/api-docs";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { emitAgentVaultTelemetry } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { actorContext } from "./agent-vault-router-fns";
import { AgentVaultProductMemberSchema, agentVaultListQuery } from "./agent-vault-schemas";

const MAX_DELEGATION_SUBJECTS = 100;

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
  createdAt: z.date().describe(AGENT_VAULT.DELEGATION.createdAt),
  updatedAt: z.date().describe(AGENT_VAULT.DELEGATION.updatedAt)
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

const subjectIdsSchema = (description: string, example: string) =>
  z
    .string()
    .uuid()
    .array()
    .max(MAX_DELEGATION_SUBJECTS)
    .default([])
    .transform((ids) => [...new Set(ids)])
    .describe(JSON.stringify({ description, example: [example] }));

const SubjectChangeBodySchema = (docs: { userIds: string; groupIds: string }) =>
  z
    .object({
      userIds: subjectIdsSchema(docs.userIds, "3c90c3cc-0d44-4b50-8888-8dd25736052a"),
      groupIds: subjectIdsSchema(docs.groupIds, "7b1e4f2a-9c3d-4a6b-8e5f-1d2c3b4a5e6f")
    })
    .refine((val) => val.userIds.length + val.groupIds.length > 0, {
      message: "Name at least one user or group."
    });

const machineIdentityParams = z.object({
  machineIdentityId: z.string().uuid().describe(AGENT_VAULT.DELEGATION.machineIdentityId)
});

const auditDelegationFields = (delegation: z.infer<typeof DelegationSchema>) => ({
  machineIdentityId: delegation.machineIdentity.id,
  machineIdentityName: delegation.machineIdentity.name,
  scope: delegation.scope,
  users: delegation.users.map((user) => ({ userId: user.id, userName: user.username })),
  groups: delegation.groups.map((group) => ({ groupId: group.id, groupName: group.name }))
});

const telemetryDelegationFields = (delegation: z.infer<typeof DelegationSchema>) => ({
  scope: delegation.scope,
  userCount: delegation.users.length,
  groupCount: delegation.groups.length
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
          // Room for 100 IDs with a separator and spaces, so the 100-ID limit below is the one that answers.
          .max(100 * 40)
          .optional()
          .transform((val) => (val ? [...new Set(val.split(",").map((id) => id.trim()))] : undefined))
          .pipe(z.string().uuid().array().max(100).optional())
          .describe(AGENT_VAULT.DELEGATION.machineIdentityIds),
        limit: z.coerce.number().int().min(1).max(100).default(100).describe(AGENT_VAULT.DELEGATION.limit),
        offset: z.coerce.number().int().min(0).max(10000).default(0).describe(AGENT_VAULT.DELEGATION.offset)
      }),
      response: {
        200: z.object({
          delegations: DelegationSchema.array(),
          totalCount: z.number().describe(AGENT_VAULT.DELEGATION.totalCount)
        })
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
      const { delegation: saved } = await server.services.agentVaultDelegation.setDelegation({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        machineIdentityId: req.params.machineIdentityId,
        ...req.body
      });

      // Before the missing bundles are worked out, so a failure there still leaves the committed save audited.
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: { type: EventType.AGENT_VAULT_DELEGATION_SET, metadata: auditDelegationFields(saved) }
      });
      emitAgentVaultTelemetry(server.services.telemetry, req, {
        event: PostHogEventTypes.AgentVaultDelegationSet,
        properties: telemetryDelegationFields(saved)
      });

      const delegation = await server.services.agentVaultDelegation.withMissingAccessBundles({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        delegation: saved
      });
      return { delegation };
    }
  });

  server.route({
    method: "GET",
    url: "/:machineIdentityId/subjects/available",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listAvailableAgentVaultDelegationSubjects",
      description: "List the Agent Vault users and groups that can still be added to a machine identity's delegation",
      tags: [ApiDocsTags.AgentVaultDelegations],
      params: machineIdentityParams,
      querystring: z.object({
        actorType: z
          .enum([AgentVaultMemberType.User, AgentVaultMemberType.Group])
          .optional()
          .describe(AGENT_VAULT.AVAILABLE_DELEGATION_SUBJECT.actorTypeFilter),
        ...agentVaultListQuery(AGENT_VAULT.AVAILABLE_DELEGATION_SUBJECT)
      }),
      response: {
        200: z.object({
          members: AgentVaultProductMemberSchema.array(),
          totalCount: z.number().describe(AGENT_VAULT.AVAILABLE_DELEGATION_SUBJECT.totalCount)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) =>
      server.services.agentVaultDelegation.listAvailableDelegationSubjects({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        machineIdentityId: req.params.machineIdentityId,
        ...req.query
      })
  });

  server.route({
    method: "POST",
    url: "/:machineIdentityId/subjects",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "addAgentVaultDelegationSubjects",
      description:
        "Add users and groups to a machine identity's delegation, keeping the ones it already names. Creates a delegation to the users and groups named if the machine identity has none.",
      tags: [ApiDocsTags.AgentVaultDelegations],
      params: machineIdentityParams,
      body: SubjectChangeBodySchema({
        userIds: AGENT_VAULT.DELEGATION.addUserIds,
        groupIds: AGENT_VAULT.DELEGATION.addGroupIds
      }),
      response: { 200: z.object({ delegation: DelegationDetailSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { delegation: saved, isChanged } = await server.services.agentVaultDelegation.addDelegationSubjects({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        machineIdentityId: req.params.machineIdentityId,
        ...req.body
      });

      if (isChanged) {
        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          orgId: req.permission.orgId,
          projectId: req.internalAgentVaultProjectId,
          event: { type: EventType.AGENT_VAULT_DELEGATION_SET, metadata: auditDelegationFields(saved) }
        });
        emitAgentVaultTelemetry(server.services.telemetry, req, {
          event: PostHogEventTypes.AgentVaultDelegationSet,
          properties: telemetryDelegationFields(saved)
        });
      }

      const delegation = await server.services.agentVaultDelegation.withMissingAccessBundles({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        delegation: saved
      });
      return { delegation };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:machineIdentityId/subjects",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "removeAgentVaultDelegationSubjects",
      description:
        "Take users and groups out of a machine identity's delegation. Taking out the last one removes the delegation, and the sessions it started for them stop working.",
      tags: [ApiDocsTags.AgentVaultDelegations],
      params: machineIdentityParams,
      body: SubjectChangeBodySchema({
        userIds: AGENT_VAULT.DELEGATION.removeUserIds,
        groupIds: AGENT_VAULT.DELEGATION.removeGroupIds
      }),
      response: {
        200: z.object({
          delegation: DelegationDetailSchema.nullable().describe(AGENT_VAULT.DELEGATION.afterRemove)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        delegation: saved,
        previous,
        isChanged
      } = await server.services.agentVaultDelegation.removeDelegationSubjects({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        machineIdentityId: req.params.machineIdentityId,
        ...req.body
      });

      // Taking out the last user or group ends the delegation, so it's audited as one being removed, naming who it
      // covered. Naming only users and groups it doesn't hold changes nothing and writes nothing.
      if (isChanged) {
        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          orgId: req.permission.orgId,
          projectId: req.internalAgentVaultProjectId,
          event: saved
            ? { type: EventType.AGENT_VAULT_DELEGATION_SET, metadata: auditDelegationFields(saved) }
            : { type: EventType.AGENT_VAULT_DELEGATION_DELETE, metadata: auditDelegationFields(previous) }
        });
        emitAgentVaultTelemetry(
          server.services.telemetry,
          req,
          saved
            ? { event: PostHogEventTypes.AgentVaultDelegationSet, properties: telemetryDelegationFields(saved) }
            : { event: PostHogEventTypes.AgentVaultDelegationDeleted, properties: telemetryDelegationFields(previous) }
        );
      }

      if (!saved) return { delegation: null };
      const delegation = await server.services.agentVaultDelegation.withMissingAccessBundles({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        delegation: saved
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
      emitAgentVaultTelemetry(server.services.telemetry, req, {
        event: PostHogEventTypes.AgentVaultDelegationDeleted,
        properties: telemetryDelegationFields(delegation)
      });

      return { delegation };
    }
  });
};
