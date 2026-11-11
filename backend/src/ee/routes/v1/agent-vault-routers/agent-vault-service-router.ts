import { z } from "zod";

import {
  AgentVaultCredentialType,
  AgentVaultVariableReferenceField
} from "@app/ee/services/agent-vault/agent-vault-enums";
import { parseHostPatterns } from "@app/ee/services/agent-vault/agent-vault-host-pattern-fns";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { AGENT_VAULT } from "@app/lib/api-docs";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { pick } from "@app/lib/fn";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { emitAgentVaultTelemetry } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import {
  actorContext,
  resolveRequestedProjectId,
  serviceTransformationNamesOf,
  serviceTypeReportFieldsOf
} from "./agent-vault-router-fns";
import {
  AGENT_VAULT_MAX_BUNDLES_PER_SERVICE_CREATE,
  AgentVaultCreateServiceBodySchema,
  AgentVaultListMcpToolsBodySchema,
  agentVaultListQuery,
  AgentVaultPersonalValueInputSchema,
  AgentVaultPersonalValuesSchema,
  AgentVaultProjectIdSchema,
  AgentVaultProjectServiceSchema,
  AgentVaultUpdateServiceBodySchema
} from "./agent-vault-schemas";

const ServiceIdParamsSchema = z.object({
  serviceId: z.string().uuid().describe(AGENT_VAULT.SERVICE.serviceId)
});

// Copied into the audit metadata as they are. The other fields are derived or reduced to names, so they stay explicit.
const SERVICE_RULE_AUDIT_FIELDS: ("allowedMethods" | "allowedPathPrefixes" | "allowedTools")[] = [
  "allowedMethods",
  "allowedPathPrefixes",
  "allowedTools"
];

const variableKeysOf = (service: { variableReferences?: { key: string }[] }) => [
  ...new Set((service.variableReferences ?? []).map((reference) => reference.key))
];

// A project's services, which access bundles hold through links, like skills. Personal values hang off the service,
// since a member sets them once however many bundles give them the service.
export const registerAgentVaultServiceRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listAgentVaultServices",
      description:
        "List the services in an Agent Vault project and the access bundles each is in, ordered by name. A member sees only the services in access bundles they have been granted.",
      tags: [ApiDocsTags.AgentVaultServices],
      querystring: z.object({
        projectId: AgentVaultProjectIdSchema,
        requiresSetup: z
          .enum(["true", "false"])
          .transform((value) => value === "true")
          .optional()
          .describe(AGENT_VAULT.SERVICE.requiresSetup),
        granted: z
          .enum(["true", "false"])
          .transform((value) => value === "true")
          .optional()
          .describe(AGENT_VAULT.SERVICE.granted),
        orderBy: z.enum(["name", "type", "createdAt"]).default("name").describe(AGENT_VAULT.SERVICE.orderBy),
        orderDirection: z.enum(["asc", "desc"]).default("asc").describe(AGENT_VAULT.SERVICE.orderDirection),
        ...agentVaultListQuery(AGENT_VAULT.SERVICE)
      }),
      response: {
        200: z.object({
          services: AgentVaultProjectServiceSchema.array(),
          totalCount: z.number().describe(AGENT_VAULT.SERVICE.totalCount)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { projectId: requestedProjectId, ...query } = req.query;
      const projectId = await resolveRequestedProjectId(req, requestedProjectId, "query");
      return server.services.agentVaultAccessBundle.listServices({ projectId, ctx: actorContext(req), ...query });
    }
  });

  server.route({
    method: "GET",
    url: "/:serviceId",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "getAgentVaultService",
      description:
        "Get a service in an Agent Vault project and the access bundles it is in. A member can get only a service in an access bundle they have been granted.",
      tags: [ApiDocsTags.AgentVaultServices],
      params: ServiceIdParamsSchema,
      response: { 200: z.object({ service: AgentVaultProjectServiceSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const projectId = await server.services.agentVaultProjectResolver.resolveFromService(
        actorContext(req),
        req.params.serviceId
      );
      return server.services.agentVaultAccessBundle.getService({
        projectId,
        ctx: actorContext(req),
        serviceId: req.params.serviceId
      });
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "createAgentVaultService",
      description:
        "Create a service in an Agent Vault project. Send accessBundleIds to add it to those access bundles in the same request.",
      tags: [ApiDocsTags.AgentVaultServices],
      body: AgentVaultCreateServiceBodySchema.and(
        z.object({
          projectId: AgentVaultProjectIdSchema,
          accessBundleIds: z
            .string()
            .uuid()
            .array()
            .max(AGENT_VAULT_MAX_BUNDLES_PER_SERVICE_CREATE)
            .optional()
            .describe(AGENT_VAULT.SERVICE.createAccessBundleIds)
        })
      ),
      response: {
        200: z.object({ service: AgentVaultProjectServiceSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { projectId: requestedProjectId, ...body } = req.body;
      const projectId = await resolveRequestedProjectId(req, requestedProjectId, "body");
      const { service } = await server.services.agentVaultAccessBundle.createService({
        ...body,
        projectId,
        ctx: actorContext(req)
      });
      const serviceTypeFields = serviceTypeReportFieldsOf(service);
      const transformationNames = serviceTransformationNamesOf(service);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
        event: {
          type: EventType.AGENT_VAULT_SERVICE_CREATE,
          metadata: {
            accessBundleIds: service.accessBundles.map((bundle) => bundle.id),
            accessBundleNames: service.accessBundles.map((bundle) => bundle.name),
            serviceId: service.id,
            name: service.name,
            description: service.description,
            serviceType: service.type,
            ...serviceTypeFields,
            credentialType: service.credential.type,
            headerName:
              service.credential.type === AgentVaultCredentialType.Bearer ? service.credential.headerName : undefined,
            headerPrefix:
              service.credential.type === AgentVaultCredentialType.Bearer ? service.credential.headerPrefix : undefined,
            oauthIssuer:
              service.credential.type === AgentVaultCredentialType.OAuth ? service.credential.issuer : undefined,
            oauthScopes:
              service.credential.type === AgentVaultCredentialType.OAuth ? service.credential.grantedScopes : undefined,
            memberProvidedFields:
              service.credential.type === AgentVaultCredentialType.Passthrough ||
              service.credential.type === AgentVaultCredentialType.SshKey
                ? undefined
                : service.credential.memberProvidedFields,
            ...transformationNames,
            variableKeys: variableKeysOf(service)
          }
        }
      });

      emitAgentVaultTelemetry(server.services.telemetry, req, {
        event: PostHogEventTypes.AgentVaultServiceCreated,
        properties: {
          serviceId: service.id,
          accessBundleCount: service.accessBundles.length,
          serviceType: service.type,
          credentialType: service.credential.type,
          hostPatternCount: serviceTypeFields.hostPattern
            ? parseHostPatterns(serviceTypeFields.hostPattern).patterns.length
            : 0,
          allowedMethodCount: serviceTypeFields.allowedMethods?.length ?? 0,
          allowedPathPrefixCount: serviceTypeFields.allowedPathPrefixes?.length ?? 0,
          allowedToolCount: serviceTypeFields.allowedTools?.length ?? 0,
          customHeaderCount: transformationNames.customHeaderNames.length,
          substitutionCount: transformationNames.substitutionPlaceholders.length,
          variableReferenceCount: service.variableReferences.length
        }
      });

      return { service };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:serviceId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "updateAgentVaultService",
      description:
        "Update a service in an Agent Vault project. Every access bundle the service is in uses the change on the proxy's next poll.",
      tags: [ApiDocsTags.AgentVaultServices],
      params: ServiceIdParamsSchema,
      body: AgentVaultUpdateServiceBodySchema,
      response: {
        200: z.object({ service: AgentVaultProjectServiceSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const projectId = await server.services.agentVaultProjectResolver.resolveFromService(
        actorContext(req),
        req.params.serviceId
      );
      const { service, update, credentialReplaced, personalValuesCleared } =
        await server.services.agentVaultAccessBundle.updateService({
          projectId,
          ctx: actorContext(req),
          serviceId: req.params.serviceId,
          ...req.body
        });
      const isOauthAuthorized =
        req.body.credential?.type === AgentVaultCredentialType.OAuth && Boolean(req.body.credential.authorizationId);
      const serviceTypeFields = serviceTypeReportFieldsOf(service);
      const transformationNames = serviceTransformationNamesOf(service);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
        event: {
          type: EventType.AGENT_VAULT_SERVICE_UPDATE,
          // Every field comes off the body, so an absent one means the PATCH did not touch it.
          metadata: {
            serviceId: service.id,
            name: req.body.name,
            description: req.body.description,
            serviceType: service.type,
            serverUrl: update.serverUrl,
            transport: update.transport,
            host: update.host,
            port: update.port,
            database: update.database,
            tlsEnabled: update.tlsEnabled,
            tlsVerify: update.tlsVerify,
            tlsCaChanged: update.tlsCaChanged,
            // Derived from the server URL for an MCP service, so it is reported whenever that changed.
            hostPattern: update.hostPattern ?? (update.serverUrl ? serviceTypeFields.hostPattern : undefined),
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
            ...pick(update, SERVICE_RULE_AUDIT_FIELDS),
            // The setting after the update, present whenever the update touched the credential.
            memberProvidedFields:
              req.body.credential &&
              service.credential.type !== AgentVaultCredentialType.Passthrough &&
              service.credential.type !== AgentVaultCredentialType.SshKey
                ? service.credential.memberProvidedFields
                : undefined,
            customHeaderNames: update.customHeaders?.map((header) => header.name),
            // A row omitting a value keeps the stored secret, so sending one is what marks a rotation.
            // Without this a rotation and a no-op save write the same row.
            customHeadersReplaced: update.customHeaders
              ?.filter((header) => header.value !== undefined)
              .map((header) => header.name),
            substitutionPlaceholders: update.substitutions?.map((substitution) => substitution.placeholder),
            substitutionsReplaced: update.substitutions
              ?.filter((substitution) => substitution.value !== undefined)
              .map((substitution) => substitution.placeholder),
            credentialReplaced,
            personalValuesCleared,
            variableKeys:
              req.body.credential || update.customHeaders || update.substitutions ? variableKeysOf(service) : undefined
          }
        }
      });

      emitAgentVaultTelemetry(server.services.telemetry, req, {
        event: PostHogEventTypes.AgentVaultServiceUpdated,
        properties: {
          serviceId: service.id,
          serviceType: service.type,
          credentialType: service.credential.type,
          hostPatternCount: serviceTypeFields.hostPattern
            ? parseHostPatterns(serviceTypeFields.hostPattern).patterns.length
            : 0,
          allowedMethodCount: serviceTypeFields.allowedMethods?.length ?? 0,
          allowedPathPrefixCount: serviceTypeFields.allowedPathPrefixes?.length ?? 0,
          allowedToolCount: serviceTypeFields.allowedTools?.length ?? 0,
          customHeaderCount: transformationNames.customHeaderNames.length,
          substitutionCount: transformationNames.substitutionPlaceholders.length,
          variableReferenceCount: service.variableReferences.length
        }
      });

      return { service };
    }
  });

  // An action route rather than a GET on the service: on create there is no service yet, and the body carries a
  // credential, which can't go in a query string.
  server.route({
    method: "POST",
    url: "/mcp-tools/list",
    config: { rateLimit: writeLimit },
    schema: {
      hide: true,
      operationId: "listAgentVaultMcpTools",
      description: "List the tools an MCP server offers, to choose which ones a service allows",
      tags: [ApiDocsTags.AgentVaultServices],
      body: AgentVaultListMcpToolsBodySchema.extend({ projectId: AgentVaultProjectIdSchema }),
      response: {
        200: z.object({
          tools: z
            .object({
              name: z.string().describe(AGENT_VAULT.SERVICE.mcpToolName),
              description: z.string().nullable().describe(AGENT_VAULT.SERVICE.mcpToolDescription)
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { projectId: requestedProjectId, ...body } = req.body;
      const projectId = await resolveRequestedProjectId(req, requestedProjectId, "body");
      return server.services.agentVaultAccessBundle.listMcpTools({
        ...body,
        projectId,
        ctx: actorContext(req)
      });
    }
  });

  server.route({
    method: "DELETE",
    url: "/:serviceId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "deleteAgentVaultService",
      description:
        "Delete a service from an Agent Vault project. It leaves every access bundle it was in, and members' personal values for it are deleted.",
      tags: [ApiDocsTags.AgentVaultServices],
      params: ServiceIdParamsSchema,
      response: { 200: z.object({ service: AgentVaultProjectServiceSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const projectId = await server.services.agentVaultProjectResolver.resolveFromService(
        actorContext(req),
        req.params.serviceId
      );
      const { service } = await server.services.agentVaultAccessBundle.deleteService({
        projectId,
        ctx: actorContext(req),
        serviceId: req.params.serviceId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
        event: {
          type: EventType.AGENT_VAULT_SERVICE_DELETE,
          metadata: {
            serviceId: service.id,
            name: service.name,
            accessBundleIds: service.accessBundles.map((bundle) => bundle.id),
            accessBundleNames: service.accessBundles.map((bundle) => bundle.name)
          }
        }
      });

      emitAgentVaultTelemetry(server.services.telemetry, req, {
        event: PostHogEventTypes.AgentVaultServiceDeleted,
        properties: { serviceId: service.id }
      });

      return { service };
    }
  });

  // The caller's own values for a service that leaves some fields to each member. Always the caller's: nobody, an
  // admin included, can name or read another's, and a stored value never comes back. Read them with the bundle.
  server.route({
    method: "PATCH",
    url: "/:serviceId/personal-values",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "setAgentVaultServicePersonalValues",
      description:
        "Set your personal values for a service. A field you send replaces what you saved for it, and a field you leave out keeps its saved value. Every field the service leaves to its members must be set once the update is applied.",
      tags: [ApiDocsTags.AgentVaultServices],
      params: ServiceIdParamsSchema,
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
      const projectId = await server.services.agentVaultProjectResolver.resolveFromService(
        actorContext(req),
        req.params.serviceId
      );
      const { personalValues } = await server.services.agentVaultPersonalValue.setPersonalValues({
        projectId,
        ctx: actorContext(req),
        serviceId: req.params.serviceId,
        values: req.body.values,
        credentialType: req.body.credentialType
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
        event: {
          type: EventType.AGENT_VAULT_PERSONAL_VALUES_SET,
          metadata: {
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

  // Saves a member's completed OAuth sign-in as their connection to a service that leaves sign-in to members. Hidden
  // like the authorization routes, since only the UI's browser sign-in can produce one.
  server.route({
    method: "POST",
    url: "/:serviceId/personal-values/oauth-connection",
    config: { rateLimit: writeLimit },
    schema: {
      hide: true,
      operationId: "connectAgentVaultServicePersonalOauth",
      tags: [ApiDocsTags.AgentVaultServices],
      params: ServiceIdParamsSchema,
      body: z.object({
        authorizationId: z.string().uuid().describe(AGENT_VAULT.OAUTH.authorizationId),
        credentialType: z
          .nativeEnum(AgentVaultCredentialType)
          .optional()
          .describe(AGENT_VAULT.PERSONAL_VALUE.credentialType)
      }),
      response: { 200: z.object({ personalValues: AgentVaultPersonalValuesSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const projectId = await server.services.agentVaultProjectResolver.resolveFromService(
        actorContext(req),
        req.params.serviceId
      );
      const { personalValues } = await server.services.agentVaultPersonalValue.connectOauth({
        projectId,
        ctx: actorContext(req),
        serviceId: req.params.serviceId,
        authorizationId: req.body.authorizationId,
        credentialType: req.body.credentialType
      });
      const oauthConnection = personalValues.fields.find((field) => field.oauth)?.oauth;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
        event: {
          type: EventType.AGENT_VAULT_PERSONAL_VALUES_SET,
          metadata: {
            serviceId: personalValues.serviceId,
            serviceName: personalValues.serviceName,
            credentialType: personalValues.credentialType,
            fields: [AgentVaultVariableReferenceField.CredentialValue],
            variableKeys: [],
            ...(oauthConnection
              ? { oauthIssuer: oauthConnection.issuer, oauthScopes: oauthConnection.grantedScopes }
              : {})
          }
        }
      });

      return {
        personalValues: {
          isConfigured: personalValues.isConfigured,
          fields: personalValues.fields
        }
      };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:serviceId/personal-values",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "deleteAgentVaultServicePersonalValues",
      description:
        "Delete your personal values for a service. Until you set them again, the proxy refuses that service's requests from your sessions.",
      tags: [ApiDocsTags.AgentVaultServices],
      params: ServiceIdParamsSchema,
      response: { 200: z.object({ personalValues: AgentVaultPersonalValuesSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const projectId = await server.services.agentVaultProjectResolver.resolveFromService(
        actorContext(req),
        req.params.serviceId
      );
      const { personalValues } = await server.services.agentVaultPersonalValue.deletePersonalValues({
        projectId,
        ctx: actorContext(req),
        serviceId: req.params.serviceId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
        event: {
          type: EventType.AGENT_VAULT_PERSONAL_VALUES_DELETE,
          metadata: {
            serviceId: personalValues.serviceId,
            serviceName: personalValues.serviceName,
            credentialType: personalValues.credentialType
          }
        }
      });

      return {
        personalValues: {
          isConfigured: personalValues.isConfigured,
          fields: personalValues.fields
        }
      };
    }
  });
};
