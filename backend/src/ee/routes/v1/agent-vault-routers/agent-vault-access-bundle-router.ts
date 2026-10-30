import { z } from "zod";

import { AgentVaultAccessBundlesSchema } from "@app/db/schemas";
import { auditActorFields } from "@app/ee/services/agent-vault/agent-vault-actor-name-fns";
import {
  AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE,
  AGENT_VAULT_NO_CONTROL_CHARS_RE
} from "@app/ee/services/agent-vault/agent-vault-credential-schemas";
import { AgentVaultCredentialType } from "@app/ee/services/agent-vault/agent-vault-enums";
import { parseHostPatterns } from "@app/ee/services/agent-vault/agent-vault-host-pattern-fns";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { AGENT_VAULT } from "@app/lib/api-docs";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { emitAgentVaultTelemetry } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { actorContext } from "./agent-vault-router-fns";
import {
  AgentVaultActorRefSchema,
  AgentVaultBundleSkillSchema,
  AgentVaultCreatedMemberSchema,
  AgentVaultCreateServiceBodySchema,
  agentVaultListQuery,
  AgentVaultMemberIdsSchema,
  AgentVaultMemberRevokeIdsSchema,
  AgentVaultMemberSchema,
  AgentVaultNameSchema,
  AgentVaultPersonalValueInputSchema,
  AgentVaultPersonalValuesSchema,
  AgentVaultProductMemberSchema,
  AgentVaultServiceSchema,
  AgentVaultUpdateServiceBodySchema
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
  createdAt: true,
  updatedAt: true
});

const variableKeysOf = (service: { variableReferences: { key: string }[] }) => [
  ...new Set(service.variableReferences.map((reference) => reference.key))
];

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
          granted: z
            .enum(["true", "false"])
            .transform((value) => value === "true")
            .optional()
            .describe(AGENT_VAULT.ACCESS_BUNDLE.granted),
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
          ...agentVaultListQuery(AGENT_VAULT.ACCESS_BUNDLE)
        })
        .refine((query) => !(query.onBehalfOfUserId && query.onBehalfOfUserEmail), {
          message: "Name the user by onBehalfOfUserId or by onBehalfOfUserEmail, not both"
        })
        .refine((query) => query.granted === undefined || !(query.onBehalfOfUserId || query.onBehalfOfUserEmail), {
          message:
            "granted filters your own access bundles, so it can't be combined with onBehalfOfUserId or onBehalfOfUserEmail"
        }),
      response: {
        200: z.object({
          accessBundles: AccessBundleSchema.extend({
            serviceCount: z.number().describe(AGENT_VAULT.ACCESS_BUNDLE.serviceCount),
            memberCount: z.number().describe(AGENT_VAULT.ACCESS_BUNDLE.memberCount),
            hostPatterns: z.string().array().describe(AGENT_VAULT.ACCESS_BUNDLE.hostPatterns),
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
      const { onBehalfOfUserId, onBehalfOfUserEmail, ...query } = req.query;
      return server.services.agentVaultAccessBundle.listAccessBundles({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        ...query,
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
            services: AgentVaultServiceSchema.partial({ variableReferences: true })
              .extend({ personalValues: AgentVaultPersonalValuesSchema.nullable() })
              .array()
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
      operationId: "createAgentVaultService",
      description: "Create a service in an Agent Vault access bundle",
      tags: [ApiDocsTags.AgentVaultAccessBundles],
      params: z.object({
        accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId)
      }),
      body: AgentVaultCreateServiceBodySchema,
      response: {
        200: z.object({ service: AgentVaultServiceSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { service, accessBundleName } = await server.services.agentVaultAccessBundle.createService({
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
          type: EventType.AGENT_VAULT_SERVICE_CREATE,
          metadata: {
            accessBundleId: req.params.accessBundleId,
            accessBundleName,
            serviceId: service.id,
            name: service.name,
            serviceType: service.type,
            serverUrl: service.serverUrl ?? undefined,
            transport: service.transport ?? undefined,
            hostPattern: service.hostPattern,
            credentialType: service.credential.type,
            headerName:
              service.credential.type === AgentVaultCredentialType.Bearer ? service.credential.headerName : undefined,
            headerPrefix:
              service.credential.type === AgentVaultCredentialType.Bearer ? service.credential.headerPrefix : undefined,
            oauthIssuer:
              service.credential.type === AgentVaultCredentialType.OAuth ? service.credential.issuer : undefined,
            oauthScopes:
              service.credential.type === AgentVaultCredentialType.OAuth ? service.credential.grantedScopes : undefined,
            allowedMethods: service.allowedMethods,
            allowedPathPrefixes: service.allowedPathPrefixes,
            memberProvidedFields:
              service.credential.type === AgentVaultCredentialType.Bearer ||
              service.credential.type === AgentVaultCredentialType.Basic
                ? service.credential.memberProvidedFields
                : undefined,
            customHeaderNames: service.customHeaders.map((header) => header.name),
            substitutionPlaceholders: service.substitutions.map((substitution) => substitution.placeholder),
            variableKeys: variableKeysOf(service)
          }
        }
      });

      emitAgentVaultTelemetry(server.services.telemetry, req, {
        event: PostHogEventTypes.AgentVaultServiceCreated,
        properties: {
          accessBundleId: req.params.accessBundleId,
          serviceId: service.id,
          serviceType: service.type,
          credentialType: service.credential.type,
          hostPatternCount: parseHostPatterns(service.hostPattern).patterns.length,
          allowedMethodCount: service.allowedMethods?.length ?? 0,
          allowedPathPrefixCount: service.allowedPathPrefixes?.length ?? 0,
          customHeaderCount: service.customHeaders.length,
          substitutionCount: service.substitutions.length,
          variableReferenceCount: service.variableReferences.length
        }
      });

      return { service };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:accessBundleId/services/:serviceId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "updateAgentVaultService",
      description: "Update a service in an Agent Vault access bundle",
      tags: [ApiDocsTags.AgentVaultAccessBundles],
      params: z.object({
        accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId),
        serviceId: z.string().uuid().describe(AGENT_VAULT.SERVICE.serviceId)
      }),
      body: AgentVaultUpdateServiceBodySchema,
      response: {
        200: z.object({ service: AgentVaultServiceSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { service, accessBundleName, update, credentialReplaced } =
        await server.services.agentVaultAccessBundle.updateService({
          projectId: req.internalAgentVaultProjectId,
          ctx: actorContext(req),
          accessBundleId: req.params.accessBundleId,
          serviceId: req.params.serviceId,
          ...req.body
        });
      const isOauthAuthorized = req.body.credential?.type === AgentVaultCredentialType.OAuth;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_SERVICE_UPDATE,
          // Every field comes off the body, so an absent one means the PATCH did not touch it.
          metadata: {
            accessBundleId: req.params.accessBundleId,
            accessBundleName,
            serviceId: service.id,
            name: req.body.name,
            serviceType: service.type,
            serverUrl: update.serverUrl,
            transport: update.transport,
            // Derived from the server URL for an MCP service, so it is reported whenever that changed.
            hostPattern: update.hostPattern ?? (update.serverUrl ? service.hostPattern : undefined),
            credentialType: req.body.credential?.type,
            headerName:
              req.body.credential?.type === AgentVaultCredentialType.Bearer
                ? req.body.credential.headerName
                : undefined,
            headerPrefix:
              req.body.credential?.type === AgentVaultCredentialType.Bearer
                ? req.body.credential.headerPrefix
                : undefined,
            oauthIssuer:
              isOauthAuthorized && service.credential.type === AgentVaultCredentialType.OAuth
                ? service.credential.issuer
                : undefined,
            oauthScopes:
              isOauthAuthorized && service.credential.type === AgentVaultCredentialType.OAuth
                ? service.credential.grantedScopes
                : undefined,
            allowedMethods: update.allowedMethods,
            allowedPathPrefixes: update.allowedPathPrefixes,
            // The setting after the update, present whenever the update touched the credential.
            memberProvidedFields:
              req.body.credential &&
              (service.credential.type === AgentVaultCredentialType.Bearer ||
                service.credential.type === AgentVaultCredentialType.Basic)
                ? service.credential.memberProvidedFields
                : undefined,
            customHeaderNames: req.body.customHeaders?.map((header) => header.name),
            // A row omitting a value keeps the stored secret, so sending one is what marks a rotation.
            // Without this a rotation and a no-op save write the same row.
            customHeadersReplaced: req.body.customHeaders
              ?.filter((header) => header.value !== undefined)
              .map((header) => header.name),
            substitutionPlaceholders: update.substitutions?.map((substitution) => substitution.placeholder),
            substitutionsReplaced: update.substitutions
              ?.filter((substitution) => substitution.value !== undefined)
              .map((substitution) => substitution.placeholder),
            credentialReplaced,
            variableKeys:
              req.body.credential || req.body.customHeaders || update.substitutions
                ? variableKeysOf(service)
                : undefined
          }
        }
      });

      emitAgentVaultTelemetry(server.services.telemetry, req, {
        event: PostHogEventTypes.AgentVaultServiceUpdated,
        properties: {
          accessBundleId: req.params.accessBundleId,
          serviceId: service.id,
          serviceType: service.type,
          credentialType: service.credential.type,
          hostPatternCount: parseHostPatterns(service.hostPattern).patterns.length,
          allowedMethodCount: service.allowedMethods?.length ?? 0,
          allowedPathPrefixCount: service.allowedPathPrefixes?.length ?? 0,
          customHeaderCount: service.customHeaders.length,
          substitutionCount: service.substitutions.length,
          variableReferenceCount: service.variableReferences.length
        }
      });

      return { service };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:accessBundleId/services/:serviceId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "deleteAgentVaultService",
      description: "Delete a service from an Agent Vault access bundle",
      tags: [ApiDocsTags.AgentVaultAccessBundles],
      params: z.object({
        accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId),
        serviceId: z.string().uuid().describe(AGENT_VAULT.SERVICE.serviceId)
      }),
      response: { 200: z.object({ service: AgentVaultServiceSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { service, accessBundleName } = await server.services.agentVaultAccessBundle.deleteService({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        accessBundleId: req.params.accessBundleId,
        serviceId: req.params.serviceId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_SERVICE_DELETE,
          metadata: {
            accessBundleId: req.params.accessBundleId,
            accessBundleName,
            serviceId: service.id,
            name: service.name
          }
        }
      });

      emitAgentVaultTelemetry(server.services.telemetry, req, {
        event: PostHogEventTypes.AgentVaultServiceDeleted,
        properties: { accessBundleId: req.params.accessBundleId, serviceId: service.id }
      });

      return { service };
    }
  });

  // The caller's own values for a service that leaves some fields to each member. Always the caller's: nobody, an
  // admin included, can name or read another's, and a stored value never comes back. Read them with the bundle.
  server.route({
    method: "PATCH",
    url: "/:accessBundleId/services/:serviceId/personal-values",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "setAgentVaultServicePersonalValues",
      description:
        "Set your personal values for a service. A field you send replaces what you saved for it, and a field you leave out keeps its saved value. Every field the service leaves to its members must be set once the update is applied.",
      tags: [ApiDocsTags.AgentVaultAccessBundles],
      params: z.object({
        accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId),
        serviceId: z.string().uuid().describe(AGENT_VAULT.SERVICE.serviceId)
      }),
      body: z.object({
        values: AgentVaultPersonalValueInputSchema.array().min(1).max(2).describe(AGENT_VAULT.PERSONAL_VALUE.values),
        credentialType: z
          .nativeEnum(AgentVaultCredentialType)
          .optional()
          .describe(AGENT_VAULT.PERSONAL_VALUE.credentialType)
      }),
      response: { 200: z.object({ personalValues: AgentVaultPersonalValuesSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { personalValues } = await server.services.agentVaultPersonalValue.setPersonalValues({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        accessBundleId: req.params.accessBundleId,
        serviceId: req.params.serviceId,
        values: req.body.values,
        credentialType: req.body.credentialType
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_PERSONAL_VALUES_SET,
          metadata: {
            accessBundleId: personalValues.accessBundleId,
            accessBundleName: personalValues.accessBundleName,
            serviceId: personalValues.serviceId,
            serviceName: personalValues.serviceName,
            credentialType: personalValues.credentialType,
            fields: req.body.values.map((value) => value.field),
            variableKeys: [
              ...new Set(
                personalValues.fields
                  .filter((field) => req.body.values.some((value) => value.field === field.field))
                  .flatMap((field) => field.variableReferences.map((reference) => reference.key))
              )
            ]
          }
        }
      });

      return { personalValues: { isConfigured: personalValues.isConfigured, fields: personalValues.fields } };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:accessBundleId/services/:serviceId/personal-values",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "deleteAgentVaultServicePersonalValues",
      description:
        "Delete your personal values for a service. Until you set them again, the proxy refuses that service's requests from your sessions.",
      tags: [ApiDocsTags.AgentVaultAccessBundles],
      params: z.object({
        accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId),
        serviceId: z.string().uuid().describe(AGENT_VAULT.SERVICE.serviceId)
      }),
      response: { 200: z.object({ personalValues: AgentVaultPersonalValuesSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { personalValues } = await server.services.agentVaultPersonalValue.deletePersonalValues({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        accessBundleId: req.params.accessBundleId,
        serviceId: req.params.serviceId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_PERSONAL_VALUES_DELETE,
          metadata: {
            accessBundleId: personalValues.accessBundleId,
            accessBundleName: personalValues.accessBundleName,
            serviceId: personalValues.serviceId,
            serviceName: personalValues.serviceName,
            credentialType: personalValues.credentialType
          }
        }
      });

      return { personalValues: { isConfigured: personalValues.isConfigured, fields: personalValues.fields } };
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
    handler: async (req) =>
      server.services.agentVaultSkill.listBundleSkills({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        accessBundleId: req.params.accessBundleId
      })
  });

  server.route({
    method: "POST",
    url: "/:accessBundleId/skills",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "addAgentVaultAccessBundleSkill",
      description:
        "Add a skill to an Agent Vault access bundle. Agents get the skill when they start with the bundle, so agents already running get it after a restart.",
      tags: [ApiDocsTags.AgentVaultAccessBundles],
      params: z.object({
        accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId)
      }),
      body: z.object({
        skillId: z.string().uuid().describe(AGENT_VAULT.SKILL.addSkillId)
      }),
      response: { 200: z.object({ skill: AgentVaultBundleSkillSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { skill, accessBundle } = await server.services.agentVaultSkill.addToBundle({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        accessBundleId: req.params.accessBundleId,
        skillId: req.body.skillId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.AGENT_VAULT_ACCESS_BUNDLE_SKILL_ADD,
          metadata: {
            skillId: skill.id,
            skillName: skill.name,
            accessBundleId: accessBundle.id,
            accessBundleName: accessBundle.name
          }
        }
      });

      emitAgentVaultTelemetry(server.services.telemetry, req, {
        event: PostHogEventTypes.AgentVaultAccessBundleSkillAdded,
        properties: { skillId: skill.id, accessBundleId: accessBundle.id }
      });

      return { skill };
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
      const { skill, accessBundle } = await server.services.agentVaultSkill.removeFromBundle({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        accessBundleId: req.params.accessBundleId,
        skillId: req.params.skillId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
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
    url: "/:accessBundleId/members",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listAgentVaultAccessBundleMembers",
      description: "List who can reach an Agent Vault access bundle",
      tags: [ApiDocsTags.AgentVaultAccessBundles],
      params: z.object({
        accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId)
      }),
      querystring: z.object(agentVaultListQuery(AGENT_VAULT.MEMBER)),
      response: { 200: z.object({ members: AgentVaultMemberSchema.array(), totalCount: z.number() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) =>
      server.services.agentVaultAccessBundle.listMembers({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        accessBundleId: req.params.accessBundleId,
        ...req.query
      })
  });

  server.route({
    method: "GET",
    url: "/:accessBundleId/members/available",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listAvailableAgentVaultAccessBundleMembers",
      description: "List the Agent Vault members who can still be granted an access bundle",
      tags: [ApiDocsTags.AgentVaultAccessBundles],
      params: z.object({
        accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId)
      }),
      querystring: z.object(agentVaultListQuery(AGENT_VAULT.AVAILABLE_GRANTEE)),
      response: {
        200: z.object({ members: AgentVaultProductMemberSchema.array(), totalCount: z.number() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) =>
      server.services.agentVaultAccessBundle.listAvailableMembers({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        accessBundleId: req.params.accessBundleId,
        ...req.query
      })
  });

  server.route({
    method: "POST",
    url: "/:accessBundleId/members",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
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
          skipped: AgentVaultActorRefSchema.array().describe(AGENT_VAULT.MEMBER.skipped)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { members, skipped, accessBundleName } = await server.services.agentVaultAccessBundle.addMembers({
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
              type: EventType.AGENT_VAULT_ACCESS_BUNDLE_MEMBER_ADD,
              metadata: {
                accessBundleId: req.params.accessBundleId,
                accessBundleName,
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
      hide: false,
      operationId: "revokeAgentVaultAccessBundleMembers",
      description: "Revoke an Agent Vault access bundle from users, machine identities or groups",
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
      const { members, skipped, accessBundleName } = await server.services.agentVaultAccessBundle.revokeMembers({
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
              type: EventType.AGENT_VAULT_ACCESS_BUNDLE_MEMBER_REMOVE,
              metadata: {
                accessBundleId: req.params.accessBundleId,
                accessBundleName,
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
