import { FastifyRequest } from "fastify";
import { z } from "zod";

import { AgentVaultAccessBundlesSchema } from "@app/db/schemas";
import { TAgentVaultActorContext } from "@app/ee/services/agent-vault/agent-vault-actor-types";
import {
  AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE,
  AGENT_VAULT_NO_CONTROL_CHARS_RE
} from "@app/ee/services/agent-vault/agent-vault-credential-schemas";
import { AgentVaultCredentialType } from "@app/ee/services/agent-vault/agent-vault-enums";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { AGENT_VAULT } from "@app/lib/api-docs";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

import {
  AgentVaultConnectionSchema,
  AgentVaultCreatedMemberSchema,
  AgentVaultCredentialInputSchema,
  AgentVaultCredentialUpdateSchema,
  AgentVaultHostPatternSchema,
  AgentVaultMemberIdsSchema,
  AgentVaultMemberSchema,
  AgentVaultNameSchema,
  AgentVaultRemovedMemberSchema
} from "./agent-vault-schemas";

const AccessBundleDescriptionSchema = z
  .string()
  .trim()
  .max(256, "A description can be at most 256 characters")
  .regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE)
  .describe(AGENT_VAULT.ACCESS_BUNDLE.description);

const AccessBundleSchema = AgentVaultAccessBundlesSchema.pick({
  id: true,
  name: true,
  description: true,
  createdAt: true
});

const actorContext = (req: FastifyRequest): TAgentVaultActorContext => ({
  actorId: req.permission.id,
  actor: req.permission.type,
  actorOrgId: req.permission.orgId,
  actorAuthMethod: req.permission.authMethod
});

// A passthrough switch is a replacement: mergeCredential returns a null secret and updateConnection nulls
// the sealed column. The old check only looked at bearer and basic, so it reported no replacement for the
// one case that destroys the credential outright.
const isStoredSecretReplaced = (credential?: z.infer<typeof AgentVaultCredentialUpdateSchema>) => {
  if (!credential) return false;
  if (credential.type === AgentVaultCredentialType.Bearer) return credential.value !== undefined;
  if (credential.type === AgentVaultCredentialType.Basic) {
    return credential.username !== undefined || credential.password !== undefined;
  }
  return true;
};

export const registerAgentVaultAccessBundleRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "listAgentVaultAccessBundles",
      description: "List the Agent Vault access bundles you can reach",
      tags: [ApiDocsTags.AgentVaultAccessBundles],
      response: {
        200: z.object({
          accessBundles: AccessBundleSchema.extend({
            connectionCount: z.number().describe(AGENT_VAULT.ACCESS_BUNDLE.connectionCount),
            memberCount: z.number().describe(AGENT_VAULT.ACCESS_BUNDLE.memberCount),
            hostPatterns: z.string().array().describe(AGENT_VAULT.ACCESS_BUNDLE.hostPatterns)
          }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const accessBundles = await server.services.agentVaultAccessBundle.listAccessBundles({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req)
      });
      return { accessBundles };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "createAgentVaultAccessBundle",
      description: "Create an Agent Vault access bundle",
      tags: [ApiDocsTags.AgentVaultAccessBundles],
      body: z.object({
        name: AgentVaultNameSchema.describe(AGENT_VAULT.ACCESS_BUNDLE.name),
        description: AccessBundleDescriptionSchema.optional()
      }),
      response: { 200: z.object({ accessBundle: AccessBundleSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const accessBundle = await server.services.agentVaultAccessBundle.createAccessBundle({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_ACCESS_BUNDLE_CREATE,
          metadata: {
            accessBundleId: accessBundle.id,
            name: accessBundle.name,
            description: accessBundle.description
          }
        }
      });

      return { accessBundle };
    }
  });

  server.route({
    method: "GET",
    url: "/:accessBundleId",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "getAgentVaultAccessBundle",
      description: "Get an Agent Vault access bundle with its connections",
      tags: [ApiDocsTags.AgentVaultAccessBundles],
      params: z.object({
        accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId)
      }),
      response: {
        200: z.object({
          accessBundle: AccessBundleSchema.extend({
            connections: AgentVaultConnectionSchema.array(),
            members: AgentVaultMemberSchema.array().optional()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const accessBundle = await server.services.agentVaultAccessBundle.getAccessBundleById({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        accessBundleId: req.params.accessBundleId
      });
      return { accessBundle };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:accessBundleId",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "updateAgentVaultAccessBundle",
      description: "Update an Agent Vault access bundle",
      tags: [ApiDocsTags.AgentVaultAccessBundles],
      params: z.object({
        accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId)
      }),
      body: z
        .object({
          name: AgentVaultNameSchema.optional().describe(AGENT_VAULT.ACCESS_BUNDLE.name),
          description: AccessBundleDescriptionSchema.nullable().optional()
        })
        .refine(
          (body) => body.name !== undefined || body.description !== undefined,
          "Provide at least one of 'name' or 'description' to update"
        ),
      response: { 200: z.object({ accessBundle: AccessBundleSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const accessBundle = await server.services.agentVaultAccessBundle.updateAccessBundle({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        accessBundleId: req.params.accessBundleId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_ACCESS_BUNDLE_UPDATE,
          metadata: {
            accessBundleId: accessBundle.id,
            name: req.body.name,
            description: req.body.description
          }
        }
      });

      return { accessBundle };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:accessBundleId",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "deleteAgentVaultAccessBundle",
      description: "Delete an Agent Vault access bundle",
      tags: [ApiDocsTags.AgentVaultAccessBundles],
      params: z.object({
        accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId)
      }),
      response: { 200: z.object({ accessBundle: AccessBundleSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const accessBundle = await server.services.agentVaultAccessBundle.deleteAccessBundle({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        accessBundleId: req.params.accessBundleId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_ACCESS_BUNDLE_DELETE,
          metadata: { accessBundleId: accessBundle.id, name: accessBundle.name }
        }
      });

      return { accessBundle };
    }
  });

  server.route({
    method: "POST",
    url: "/:accessBundleId/connections",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "createAgentVaultConnection",
      description: "Add a connection to an Agent Vault access bundle",
      tags: [ApiDocsTags.AgentVaultAccessBundles],
      params: z.object({
        accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId)
      }),
      body: z.object({
        name: AgentVaultNameSchema.describe(AGENT_VAULT.CONNECTION.name),
        hostPattern: AgentVaultHostPatternSchema,
        credential: AgentVaultCredentialInputSchema
      }),
      response: {
        200: z.object({ connection: AgentVaultConnectionSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { connection } = await server.services.agentVaultAccessBundle.createConnection({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        accessBundleId: req.params.accessBundleId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_CONNECTION_CREATE,
          metadata: {
            accessBundleId: req.params.accessBundleId,
            connectionId: connection.id,
            name: connection.name,
            hostPattern: connection.hostPattern,
            credentialType: connection.credentialType,
            headerName:
              connection.credential.type === AgentVaultCredentialType.Bearer
                ? connection.credential.headerName
                : undefined,
            headerPrefix:
              connection.credential.type === AgentVaultCredentialType.Bearer
                ? connection.credential.headerPrefix
                : undefined
          }
        }
      });

      return { connection };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:accessBundleId/connections/:connectionId",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "updateAgentVaultConnection",
      description: "Update a connection in an Agent Vault access bundle",
      tags: [ApiDocsTags.AgentVaultAccessBundles],
      params: z.object({
        accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId),
        connectionId: z.string().uuid().describe(AGENT_VAULT.CONNECTION.connectionId)
      }),
      body: z
        .object({
          name: AgentVaultNameSchema.optional().describe(AGENT_VAULT.CONNECTION.name),
          hostPattern: AgentVaultHostPatternSchema.optional(),
          credential: AgentVaultCredentialUpdateSchema.optional()
        })
        .refine(
          (body) => body.name !== undefined || body.hostPattern !== undefined || body.credential !== undefined,
          "Provide at least one of 'name', 'hostPattern' or 'credential' to update"
        ),
      response: {
        200: z.object({ connection: AgentVaultConnectionSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { connection } = await server.services.agentVaultAccessBundle.updateConnection({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        accessBundleId: req.params.accessBundleId,
        connectionId: req.params.connectionId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_CONNECTION_UPDATE,
          // Every field comes off the body, so an absent one means the PATCH did not touch it.
          metadata: {
            accessBundleId: req.params.accessBundleId,
            connectionId: connection.id,
            name: req.body.name,
            hostPattern: req.body.hostPattern,
            credentialType: req.body.credential?.type,
            headerName:
              req.body.credential?.type === AgentVaultCredentialType.Bearer
                ? req.body.credential.headerName
                : undefined,
            headerPrefix:
              req.body.credential?.type === AgentVaultCredentialType.Bearer
                ? req.body.credential.headerPrefix
                : undefined,
            credentialReplaced: isStoredSecretReplaced(req.body.credential)
          }
        }
      });

      return { connection };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:accessBundleId/connections/:connectionId",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "deleteAgentVaultConnection",
      description: "Delete a connection from an Agent Vault access bundle",
      tags: [ApiDocsTags.AgentVaultAccessBundles],
      params: z.object({
        accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId),
        connectionId: z.string().uuid().describe(AGENT_VAULT.CONNECTION.connectionId)
      }),
      response: { 200: z.object({ connection: AgentVaultConnectionSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const connection = await server.services.agentVaultAccessBundle.deleteConnection({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        accessBundleId: req.params.accessBundleId,
        connectionId: req.params.connectionId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_CONNECTION_DELETE,
          metadata: {
            accessBundleId: req.params.accessBundleId,
            connectionId: connection.id,
            name: connection.name
          }
        }
      });

      return { connection };
    }
  });

  server.route({
    method: "GET",
    url: "/:accessBundleId/members",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "listAgentVaultAccessBundleMembers",
      description: "List who can reach an Agent Vault access bundle",
      tags: [ApiDocsTags.AgentVaultAccessBundles],
      params: z.object({
        accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId)
      }),
      response: { 200: z.object({ members: AgentVaultMemberSchema.array() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const members = await server.services.agentVaultAccessBundle.listMembers({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        accessBundleId: req.params.accessBundleId
      });
      return { members };
    }
  });

  server.route({
    method: "POST",
    url: "/:accessBundleId/members",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "addAgentVaultAccessBundleMembers",
      description: "Grant an Agent Vault access bundle to users, machine identities or groups",
      tags: [ApiDocsTags.AgentVaultAccessBundles],
      params: z.object({
        accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId)
      }),
      body: AgentVaultMemberIdsSchema,
      response: {
        200: z.object({
          members: AgentVaultCreatedMemberSchema.array(),
          skippedCount: z.number().describe(AGENT_VAULT.MEMBER.skippedCount)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { members, skippedCount, accessBundleName } = await server.services.agentVaultAccessBundle.addMembers({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        accessBundleId: req.params.accessBundleId,
        ...req.body
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
                accessBundleId: req.params.accessBundleId,
                accessBundleName,
                memberId: member.id,
                ...(member.userId && { userId: member.userId }),
                ...(member.identityId && { identityId: member.identityId }),
                ...(member.groupId && { groupId: member.groupId })
              }
            }
          })
        )
      );

      return { members, skippedCount };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:accessBundleId/members/:memberId",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "removeAgentVaultAccessBundleMember",
      description: "Revoke an Agent Vault access bundle from a user, machine identity or group",
      tags: [ApiDocsTags.AgentVaultAccessBundles],
      params: z.object({
        accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId),
        memberId: z.string().uuid().describe(AGENT_VAULT.MEMBER.memberId)
      }),
      response: { 200: z.object({ member: AgentVaultRemovedMemberSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const member = await server.services.agentVaultAccessBundle.removeMember({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        accessBundleId: req.params.accessBundleId,
        memberId: req.params.memberId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_MEMBER_REMOVE,
          metadata: {
            accessBundleId: req.params.accessBundleId,
            accessBundleName: member.accessBundleName,
            memberId: member.id
          }
        }
      });

      return { member };
    }
  });
};
