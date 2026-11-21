import { z } from "zod";

import { AgentVaultAccessBundlesSchema } from "@app/db/schemas";
import { auditActorFields } from "@app/ee/services/agent-vault/agent-vault-actor-name-fns";
import { AgentVaultMemberType, AgentVaultServiceType } from "@app/ee/services/agent-vault/agent-vault-enums";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { AGENT_VAULT } from "@app/lib/api-docs";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { openApiHidden } from "@app/server/lib/schemas";
import { emitAgentVaultTelemetry } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { actorContext, resolveRequestedProjectId, withDeprecatedRole } from "./agent-vault-router-fns";
import {
  AGENT_VAULT_MAX_ADDS_PER_BUNDLE_REQUEST,
  AgentVaultActorRefSchema,
  AgentVaultBundleSkillSchema,
  AgentVaultCreatedMemberSchema,
  AgentVaultDescriptionSchema,
  agentVaultListQuery,
  AgentVaultMemberIdsSchema,
  AgentVaultMemberRevokeIdsSchema,
  AgentVaultMemberSchema,
  AgentVaultNameSchema,
  AgentVaultPersonalValuesSchema,
  AgentVaultProductMemberSchema,
  AgentVaultProjectIdSchema,
  AgentVaultRoleThatCanUseSchema,
  agentVaultServiceResponseSchema,
  AgentVaultProjectServiceSchema,
  AgentVaultSkippedBundleItemSchema
} from "./agent-vault-schemas";

const AccessBundleDescriptionSchema = AgentVaultDescriptionSchema.describe(AGENT_VAULT.ACCESS_BUNDLE.description);

const AccessBundleSchema = AgentVaultAccessBundlesSchema.pick({
  id: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true
});

export const registerAgentVaultAccessBundleRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listAgentVaultAccessBundles",
      description: "List the Agent Vault access bundles you can reach",
      tags: [ApiDocsTags.AgentVaultAccessBundles],
      querystring: z
        .object({
          requiresSetup: z
            .enum(["true", "false"])
            .transform((value) => value === "true")
            .optional()
            .describe(AGENT_VAULT.ACCESS_BUNDLE.requiresSetup),
          assigned: z
            .enum(["true", "false"])
            .transform((value) => value === "true")
            .optional()
            .describe(AGENT_VAULT.ACCESS_BUNDLE.assigned),
          // The older name of assigned, which the SDKs still send. It goes on 2027-01-04 with the grant endpoints.
          granted: z
            .enum(["true", "false"])
            .transform((value) => value === "true")
            .optional()
            .describe(openApiHidden()),
          orderBy: z
            .enum(["name", "serviceCount", "createdAt"])
            .default("createdAt")
            .describe(AGENT_VAULT.ACCESS_BUNDLE.orderBy),
          orderDirection: z.enum(["asc", "desc"]).default("desc").describe(AGENT_VAULT.ACCESS_BUNDLE.orderDirection),
          onBehalfOfUserId: z.string().uuid().optional().describe(AGENT_VAULT.ACCESS_BUNDLE.onBehalfOfUserId),
          onBehalfOfUserEmail: z
            .string()
            .trim()
            .toLowerCase()
            .email()
            .max(255)
            .optional()
            .describe(AGENT_VAULT.ACCESS_BUNDLE.onBehalfOfUserEmail),
          ...agentVaultListQuery(AGENT_VAULT.ACCESS_BUNDLE),
          projectId: AgentVaultProjectIdSchema
        })
        .refine((query) => !(query.onBehalfOfUserId && query.onBehalfOfUserEmail), {
          message: "Name the user by onBehalfOfUserId or by onBehalfOfUserEmail, not both"
        })
        .refine((query) => query.assigned === undefined || query.granted === undefined, {
          message: "granted is the older name of assigned, so send only assigned"
        })
        .refine(
          (query) =>
            (query.assigned ?? query.granted) === undefined || !(query.onBehalfOfUserId || query.onBehalfOfUserEmail),
          {
            message:
              "assigned filters your own access bundles, so it can't be combined with onBehalfOfUserId or onBehalfOfUserEmail"
          }
        ),
      response: {
        200: z.object({
          accessBundles: AccessBundleSchema.extend({
            serviceCount: z.number().describe(AGENT_VAULT.ACCESS_BUNDLE.serviceCount),
            // Holders of the bundle's own role, which only the deprecated grant endpoints give. Kept for SDKs until 2027-01-04.
            memberCount: z.number().describe(openApiHidden()),
            hostPatterns: z.string().array().describe(AGENT_VAULT.ACCESS_BUNDLE.hostPatterns),
            nativeServices: z
              .object({
                name: z.string().describe(AGENT_VAULT.ACCESS_BUNDLE.nativeServiceName),
                type: z.nativeEnum(AgentVaultServiceType).describe(AGENT_VAULT.ACCESS_BUNDLE.nativeServiceType)
              })
              .array()
              .describe(AGENT_VAULT.ACCESS_BUNDLE.nativeServices),
            servicesRequiringSetup: z
              .object({
                id: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.servicesRequiringSetupId),
                name: z.string().describe(AGENT_VAULT.ACCESS_BUNDLE.servicesRequiringSetupName)
              })
              .array()
              .describe(AGENT_VAULT.ACCESS_BUNDLE.servicesRequiringSetup)
          }).array(),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const {
        projectId: requestedProjectId,
        onBehalfOfUserId,
        onBehalfOfUserEmail,
        assigned,
        granted,
        ...query
      } = req.query;
      const projectId = await resolveRequestedProjectId(req, requestedProjectId, "query");
      return server.services.agentVaultAccessBundle.listAccessBundles({
        projectId,
        ctx: actorContext(req),
        ...query,
        assigned: assigned ?? granted,
        onBehalfOf:
          onBehalfOfUserId || onBehalfOfUserEmail
            ? { userId: onBehalfOfUserId, userEmail: onBehalfOfUserEmail }
            : undefined
      });
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "createAgentVaultAccessBundle",
      description: "Create an Agent Vault access bundle",
      tags: [ApiDocsTags.AgentVaultAccessBundles],
      body: z.object({
        name: AgentVaultNameSchema.describe(AGENT_VAULT.ACCESS_BUNDLE.name),
        description: AccessBundleDescriptionSchema.optional(),
        projectId: AgentVaultProjectIdSchema
      }),
      response: { 200: z.object({ accessBundle: AccessBundleSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { projectId: requestedProjectId, ...body } = req.body;
      const projectId = await resolveRequestedProjectId(req, requestedProjectId, "body");
      const { accessBundle, role } = await server.services.agentVaultAccessBundle.createAccessBundle({
        projectId,
        ctx: actorContext(req),
        ...body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
        event: {
          type: EventType.AGENT_VAULT_ACCESS_BUNDLE_CREATE,
          metadata: {
            accessBundleId: accessBundle.id,
            name: accessBundle.name,
            description: accessBundle.description,
            ...(role ? { roleId: role.id, roleSlug: role.slug } : {})
          }
        }
      });

      emitAgentVaultTelemetry(server.services.telemetry, req, {
        event: PostHogEventTypes.AgentVaultAccessBundleCreated,
        properties: { accessBundleId: accessBundle.id }
      });

      return { accessBundle };
    }
  });

  server.route({
    method: "GET",
    url: "/:accessBundleId",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "getAgentVaultAccessBundle",
      description: "Get an Agent Vault access bundle with its services",
      tags: [ApiDocsTags.AgentVaultAccessBundles],
      params: z.object({
        accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId)
      }),
      response: {
        200: z.object({
          accessBundle: AccessBundleSchema.extend({
            services: agentVaultServiceResponseSchema(
              {
                // Python SDK v1.4.0 and older require it on every service. Keep until 2027-01-04.
                accessBundleId: z.string().uuid().describe(openApiHidden()),
                personalValues: AgentVaultPersonalValuesSchema.nullable()
              },
              { optionalVariableReferences: true }
            ).array()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const projectId = await server.services.agentVaultProjectResolver.resolveFromAccessBundle(
        actorContext(req),
        req.params.accessBundleId
      );
      const accessBundle = await server.services.agentVaultAccessBundle.getAccessBundleById({
        projectId,
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
      hide: false,
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
          (body) => Object.values(body).some((value) => value !== undefined),
          "Provide at least one of 'name' or 'description' to update"
        ),
      response: { 200: z.object({ accessBundle: AccessBundleSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const projectId = await server.services.agentVaultProjectResolver.resolveFromAccessBundle(
        actorContext(req),
        req.params.accessBundleId
      );
      const accessBundle = await server.services.agentVaultAccessBundle.updateAccessBundle({
        projectId,
        ctx: actorContext(req),
        accessBundleId: req.params.accessBundleId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
        event: {
          type: EventType.AGENT_VAULT_ACCESS_BUNDLE_UPDATE,
          metadata: {
            accessBundleId: accessBundle.id,
            name: accessBundle.name,
            description: req.body.description
          }
        }
      });

      emitAgentVaultTelemetry(server.services.telemetry, req, {
        event: PostHogEventTypes.AgentVaultAccessBundleUpdated,
        properties: { accessBundleId: accessBundle.id }
      });

      return { accessBundle };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:accessBundleId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
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
      const projectId = await server.services.agentVaultProjectResolver.resolveFromAccessBundle(
        actorContext(req),
        req.params.accessBundleId
      );
      const { accessBundle, removedRole } = await server.services.agentVaultAccessBundle.deleteAccessBundle({
        projectId,
        ctx: actorContext(req),
        accessBundleId: req.params.accessBundleId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
        event: {
          type: EventType.AGENT_VAULT_ACCESS_BUNDLE_DELETE,
          metadata: {
            accessBundleId: accessBundle.id,
            name: accessBundle.name,
            ...(removedRole ? { deletedRoleId: removedRole.id, deletedRoleSlug: removedRole.slug } : {})
          }
        }
      });

      emitAgentVaultTelemetry(server.services.telemetry, req, {
        event: PostHogEventTypes.AgentVaultAccessBundleDeleted,
        properties: { accessBundleId: accessBundle.id }
      });

      return { accessBundle };
    }
  });

  server.route({
    method: "POST",
    url: "/:accessBundleId/services",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "addAgentVaultAccessBundleService",
      description:
        "Add services from the Agent Vault project to an access bundle. Sessions on the bundle reach them from the proxy's next poll.",
      tags: [ApiDocsTags.AgentVaultAccessBundles],
      params: z.object({
        accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId)
      }),
      body: z.object({
        serviceIds: z
          .string()
          .uuid()
          .array()
          .min(1)
          .max(AGENT_VAULT_MAX_ADDS_PER_BUNDLE_REQUEST)
          .describe(AGENT_VAULT.SERVICE.addServiceIds)
      }),
      response: {
        200: z.object({
          services: AgentVaultProjectServiceSchema.array().describe(AGENT_VAULT.SERVICE.addedServices),
          skipped: AgentVaultSkippedBundleItemSchema.array().describe(AGENT_VAULT.SERVICE.addSkippedServices)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const projectId = await server.services.agentVaultProjectResolver.resolveFromAccessBundle(
        actorContext(req),
        req.params.accessBundleId
      );
      const { services, skipped, accessBundle } = await server.services.agentVaultAccessBundle.addServicesToBundle({
        projectId,
        ctx: actorContext(req),
        accessBundleId: req.params.accessBundleId,
        serviceIds: req.body.serviceIds
      });

      await Promise.all(
        services.map((service) =>
          server.services.auditLog.createAuditLog({
            ...req.auditLogInfo,
            orgId: req.permission.orgId,
            projectId,
            event: {
              type: EventType.AGENT_VAULT_ACCESS_BUNDLE_SERVICE_ADD,
              metadata: {
                serviceId: service.id,
                serviceName: service.name,
                accessBundleId: accessBundle.id,
                accessBundleName: accessBundle.name
              }
            }
          })
        )
      );

      services.forEach((service) =>
        emitAgentVaultTelemetry(server.services.telemetry, req, {
          event: PostHogEventTypes.AgentVaultAccessBundleServiceAdded,
          properties: { serviceId: service.id, accessBundleId: accessBundle.id, serviceType: service.type }
        })
      );

      return { services, skipped };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:accessBundleId/services/:serviceId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "removeAgentVaultAccessBundleService",
      description:
        "Remove a service from an Agent Vault access bundle. The service stays in the project. Members who reached it only through this bundle lose their personal values for it.",
      tags: [ApiDocsTags.AgentVaultAccessBundles],
      params: z.object({
        accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId),
        serviceId: z.string().uuid().describe(AGENT_VAULT.SERVICE.serviceId)
      }),
      response: { 200: z.object({ service: AgentVaultProjectServiceSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const projectId = await server.services.agentVaultProjectResolver.resolveFromAccessBundle(
        actorContext(req),
        req.params.accessBundleId
      );
      const { service, accessBundle } = await server.services.agentVaultAccessBundle.removeServiceFromBundle({
        projectId,
        ctx: actorContext(req),
        accessBundleId: req.params.accessBundleId,
        serviceId: req.params.serviceId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
        event: {
          type: EventType.AGENT_VAULT_ACCESS_BUNDLE_SERVICE_REMOVE,
          metadata: {
            serviceId: service.id,
            serviceName: service.name,
            accessBundleId: accessBundle.id,
            accessBundleName: accessBundle.name
          }
        }
      });

      emitAgentVaultTelemetry(server.services.telemetry, req, {
        event: PostHogEventTypes.AgentVaultAccessBundleServiceRemoved,
        properties: { serviceId: service.id, accessBundleId: accessBundle.id, serviceType: service.type }
      });

      return { service };
    }
  });

  server.route({
    method: "GET",
    url: "/:accessBundleId/skills",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listAgentVaultAccessBundleSkills",
      description: "List the skills in an Agent Vault access bundle, ordered by name",
      tags: [ApiDocsTags.AgentVaultAccessBundles],
      params: z.object({
        accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId)
      }),
      response: { 200: z.object({ skills: AgentVaultBundleSkillSchema.array() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const projectId = await server.services.agentVaultProjectResolver.resolveFromAccessBundle(
        actorContext(req),
        req.params.accessBundleId
      );
      return server.services.agentVaultSkill.listBundleSkills({
        projectId,
        ctx: actorContext(req),
        accessBundleId: req.params.accessBundleId
      });
    }
  });

  server.route({
    method: "POST",
    url: "/:accessBundleId/skills",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "addAgentVaultAccessBundleSkill",
      description:
        "Add skills to an Agent Vault access bundle. Agents get the skills when they start with the bundle, so agents already running get them after a restart.",
      tags: [ApiDocsTags.AgentVaultAccessBundles],
      params: z.object({
        accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId)
      }),
      body: z.object({
        skillIds: z
          .string()
          .uuid()
          .array()
          .min(1)
          .max(AGENT_VAULT_MAX_ADDS_PER_BUNDLE_REQUEST)
          .describe(AGENT_VAULT.SKILL.addSkillIds)
      }),
      response: {
        200: z.object({
          skills: AgentVaultBundleSkillSchema.array().describe(AGENT_VAULT.SKILL.addedSkills),
          skipped: AgentVaultSkippedBundleItemSchema.array().describe(AGENT_VAULT.SKILL.addSkippedSkills)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const projectId = await server.services.agentVaultProjectResolver.resolveFromAccessBundle(
        actorContext(req),
        req.params.accessBundleId
      );
      const { skills, skipped, accessBundle } = await server.services.agentVaultSkill.addToBundle({
        projectId,
        ctx: actorContext(req),
        accessBundleId: req.params.accessBundleId,
        skillIds: req.body.skillIds
      });

      await Promise.all(
        skills.map((skill) =>
          server.services.auditLog.createAuditLog({
            ...req.auditLogInfo,
            orgId: req.permission.orgId,
            projectId,
            event: {
              type: EventType.AGENT_VAULT_ACCESS_BUNDLE_SKILL_ADD,
              metadata: {
                skillId: skill.id,
                skillName: skill.name,
                accessBundleId: accessBundle.id,
                accessBundleName: accessBundle.name
              }
            }
          })
        )
      );

      skills.forEach((skill) =>
        emitAgentVaultTelemetry(server.services.telemetry, req, {
          event: PostHogEventTypes.AgentVaultAccessBundleSkillAdded,
          properties: { skillId: skill.id, accessBundleId: accessBundle.id }
        })
      );

      return { skills, skipped };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:accessBundleId/skills/:skillId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "removeAgentVaultAccessBundleSkill",
      description: "Remove a skill from an Agent Vault access bundle.",
      tags: [ApiDocsTags.AgentVaultAccessBundles],
      params: z.object({
        accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId),
        skillId: z.string().uuid().describe(AGENT_VAULT.SKILL.skillId)
      }),
      response: { 200: z.object({ skill: AgentVaultBundleSkillSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const projectId = await server.services.agentVaultProjectResolver.resolveFromAccessBundle(
        actorContext(req),
        req.params.accessBundleId
      );
      const { skill, accessBundle } = await server.services.agentVaultSkill.removeFromBundle({
        projectId,
        ctx: actorContext(req),
        accessBundleId: req.params.accessBundleId,
        skillId: req.params.skillId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
        event: {
          type: EventType.AGENT_VAULT_ACCESS_BUNDLE_SKILL_REMOVE,
          metadata: {
            skillId: skill.id,
            skillName: skill.name,
            accessBundleId: accessBundle.id,
            accessBundleName: accessBundle.name
          }
        }
      });

      emitAgentVaultTelemetry(server.services.telemetry, req, {
        event: PostHogEventTypes.AgentVaultAccessBundleSkillRemoved,
        properties: { skillId: skill.id, accessBundleId: accessBundle.id }
      });

      return { skill };
    }
  });

  server.route({
    method: "GET",
    url: "/:accessBundleId/roles",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listAgentVaultAccessBundleRoles",
      description:
        "List the roles that let someone use an Agent Vault access bundle, and how many members hold each. Give one of these roles to let a user, group or machine identity use the bundle.",
      tags: [ApiDocsTags.AgentVaultAccessBundles],
      params: z.object({
        accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId)
      }),
      response: {
        200: z.object({
          roles: AgentVaultRoleThatCanUseSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const projectId = await server.services.agentVaultProjectResolver.resolveFromAccessBundle(
        actorContext(req),
        req.params.accessBundleId
      );
      return server.services.agentVaultAccessBundle.listBundleRoles({
        projectId,
        ctx: actorContext(req),
        accessBundleId: req.params.accessBundleId
      });
    }
  });

  // The grant routes below work through the bundle's role (agent-vault-bundle-role-fns.ts) for clients built before
  // roles. They are left out of the API reference and go after 2027-01-04.
  server.route({
    method: "GET",
    url: "/:accessBundleId/members",
    config: { rateLimit: readLimit },
    schema: {
      hide: true,
      operationId: "listAgentVaultAccessBundleMembers",
      description: "Deprecated: list who holds an Agent Vault access bundle's role. List the bundle's roles instead.",
      tags: [ApiDocsTags.AgentVaultAccessBundles],
      params: z.object({
        accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId)
      }),
      querystring: z.object({
        actorType: z.nativeEnum(AgentVaultMemberType).optional().describe(AGENT_VAULT.MEMBER.actorTypeFilter),
        ...agentVaultListQuery(AGENT_VAULT.MEMBER)
      }),
      response: { 200: z.object({ members: AgentVaultMemberSchema.array(), totalCount: z.number() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const projectId = await server.services.agentVaultProjectResolver.resolveFromAccessBundle(
        actorContext(req),
        req.params.accessBundleId
      );
      return server.services.agentVaultAccessBundle.listMembers({
        projectId,
        ctx: actorContext(req),
        accessBundleId: req.params.accessBundleId,
        ...req.query
      });
    }
  });

  server.route({
    method: "GET",
    url: "/:accessBundleId/members/available",
    config: { rateLimit: readLimit },
    schema: {
      hide: true,
      operationId: "listAvailableAgentVaultAccessBundleMembers",
      description: "Deprecated: list the Agent Vault members who don't hold an access bundle's role yet.",
      tags: [ApiDocsTags.AgentVaultAccessBundles],
      params: z.object({
        accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId)
      }),
      querystring: z.object({
        actorType: z
          .nativeEnum(AgentVaultMemberType)
          .optional()
          .describe(AGENT_VAULT.AVAILABLE_GRANTEE.actorTypeFilter),
        ...agentVaultListQuery(AGENT_VAULT.AVAILABLE_GRANTEE)
      }),
      response: {
        200: z.object({ members: AgentVaultProductMemberSchema.array(), totalCount: z.number() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const projectId = await server.services.agentVaultProjectResolver.resolveFromAccessBundle(
        actorContext(req),
        req.params.accessBundleId
      );
      const { members, totalCount } = await server.services.agentVaultAccessBundle.listAvailableMembers({
        projectId,
        ctx: actorContext(req),
        accessBundleId: req.params.accessBundleId,
        ...req.query
      });
      const memberRoleSlug = await server.services.agentVaultMembership.findMemberRoleSlug(projectId);
      return { members: members.map(withDeprecatedRole(memberRoleSlug)), totalCount };
    }
  });

  server.route({
    method: "POST",
    url: "/:accessBundleId/members",
    config: { rateLimit: writeLimit },
    schema: {
      hide: true,
      operationId: "addAgentVaultAccessBundleMembers",
      description:
        "Deprecated: give users, machine identities or groups an Agent Vault access bundle's role. Give members a role that can use the bundle instead.",
      tags: [ApiDocsTags.AgentVaultAccessBundles],
      params: z.object({
        accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId)
      }),
      body: AgentVaultMemberIdsSchema,
      response: {
        200: z.object({
          members: AgentVaultCreatedMemberSchema.array(),
          skipped: AgentVaultActorRefSchema.array().describe(AGENT_VAULT.MEMBER.skipped)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const projectId = await server.services.agentVaultProjectResolver.resolveFromAccessBundle(
        actorContext(req),
        req.params.accessBundleId
      );
      const { members, skipped, accessBundleName, role } = await server.services.agentVaultAccessBundle.addMembers({
        projectId,
        ctx: actorContext(req),
        accessBundleId: req.params.accessBundleId,
        ...req.body
      });

      await Promise.all(
        members.map((member) =>
          server.services.auditLog.createAuditLog({
            ...req.auditLogInfo,
            orgId: req.permission.orgId,
            projectId,
            event: {
              type: EventType.AGENT_VAULT_ACCESS_BUNDLE_MEMBER_ADD,
              metadata: {
                accessBundleId: req.params.accessBundleId,
                accessBundleName,
                roleId: role.id,
                roleSlug: role.slug,
                ...auditActorFields(member)
              }
            }
          })
        )
      );

      members.forEach((member) =>
        emitAgentVaultTelemetry(server.services.telemetry, req, {
          event: PostHogEventTypes.AgentVaultAccessBundleMemberAdded,
          properties: { accessBundleId: req.params.accessBundleId, memberType: member.type }
        })
      );

      return { members, skipped };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:accessBundleId/members",
    config: { rateLimit: writeLimit },
    schema: {
      hide: true,
      operationId: "revokeAgentVaultAccessBundleMembers",
      description:
        "Deprecated: take an Agent Vault access bundle's role from users, machine identities or groups. Change members' roles instead.",
      tags: [ApiDocsTags.AgentVaultAccessBundles],
      params: z.object({
        accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId)
      }),
      body: AgentVaultMemberRevokeIdsSchema,
      response: {
        200: z.object({
          members: AgentVaultActorRefSchema.array(),
          skipped: AgentVaultActorRefSchema.array().describe(AGENT_VAULT.MEMBER.revokeSkipped)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const projectId = await server.services.agentVaultProjectResolver.resolveFromAccessBundle(
        actorContext(req),
        req.params.accessBundleId
      );
      const { members, skipped, accessBundleName, role } = await server.services.agentVaultAccessBundle.revokeMembers({
        projectId,
        ctx: actorContext(req),
        accessBundleId: req.params.accessBundleId,
        ...req.body
      });

      await Promise.all(
        members.map((member) =>
          server.services.auditLog.createAuditLog({
            ...req.auditLogInfo,
            orgId: req.permission.orgId,
            projectId,
            event: {
              type: EventType.AGENT_VAULT_ACCESS_BUNDLE_MEMBER_REMOVE,
              metadata: {
                accessBundleId: req.params.accessBundleId,
                accessBundleName,
                ...(role ? { roleId: role.id, roleSlug: role.slug } : {}),
                ...auditActorFields(member)
              }
            }
          })
        )
      );

      members.forEach((member) =>
        emitAgentVaultTelemetry(server.services.telemetry, req, {
          event: PostHogEventTypes.AgentVaultAccessBundleMemberRemoved,
          properties: { accessBundleId: req.params.accessBundleId, memberType: member.type }
        })
      );

      return { members, skipped };
    }
  });
};
