import { z } from "zod";

import { PamDiscoverySourceRunsSchema, PamDiscoverySourcesSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { PamAccountType } from "@app/ee/services/pam/pam-enums";
import {
  PamDiscoveryImportStatus,
  PamDiscoveryRunStatus,
  PamDiscoverySchedule
} from "@app/ee/services/pam-discovery/pam-discovery-enums";
import {
  buildPamDiscoveryTypeMetadata,
  DISCOVERY_TYPE_CONFIGS,
  PamDiscoveryTypeMetadataSchema
} from "@app/ee/services/pam-discovery/pam-discovery-schemas";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { withRoutePrefix } from "@app/server/lib/with-route-prefix";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

type TSupportedConfigs = typeof DISCOVERY_TYPE_CONFIGS;
type TSupportedDiscoveryType = keyof TSupportedConfigs;

const SourceSchema = PamDiscoverySourcesSchema.extend({
  lastRunStatus: z.nativeEnum(PamDiscoveryRunStatus).nullable().optional(),
  lastRunError: z.string().nullable().optional()
});

const DiscoveredAccountSchema = z.object({
  id: z.string(),
  accountType: z.nativeEnum(PamAccountType),
  name: z.string(),
  fingerprint: z.string(),
  createdAt: z.date()
});

const toPascalCase = (s: string) =>
  s
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");

const registerPerTypeEndpoints = (
  server: FastifyZodProvider,
  discoveryType: TSupportedDiscoveryType,
  config: TSupportedConfigs[TSupportedDiscoveryType]
) => {
  const typeId = toPascalCase(discoveryType);

  server.route({
    method: "POST",
    url: "/",
    schema: {
      operationId: `create${typeId}PamDiscoverySource`,
      description: `Create a new ${discoveryType} PAM discovery source`,
      tags: [ApiDocsTags.PamDiscovery],
      body: z.object({
        name: slugSchema({ field: "Name" }),
        credentialAccountId: z.string().uuid().describe("The PAM account used to authenticate and scan"),
        gatewayId: z.string().uuid().optional(),
        gatewayPoolId: z.string().uuid().optional(),
        schedule: z.nativeEnum(PamDiscoverySchedule).default(PamDiscoverySchedule.Manual),
        configuration: config.configuration.optional()
      }),
      response: { 200: z.object({ source: SourceSchema }) }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const source = await server.services.pamDiscovery.create({
        discoveryType,
        name: req.body.name,
        credentialAccountId: req.body.credentialAccountId,
        gatewayId: req.body.gatewayId,
        gatewayPoolId: req.body.gatewayPoolId,
        schedule: req.body.schedule,
        configuration: req.body.configuration ?? {},
        projectId: req.internalPamProjectId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalPamProjectId,
        event: {
          type: EventType.PAM_DISCOVERY_SOURCE_CREATE,
          metadata: { sourceId: source.id, discoveryType, name: req.body.name }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.PamDiscoverySourceCreated,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: { discoveryType, orgId: req.permission.orgId }
        })
        .catch(() => {});

      return { source };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:sourceId",
    schema: {
      operationId: `update${typeId}PamDiscoverySource`,
      description: `Update a ${discoveryType} PAM discovery source`,
      tags: [ApiDocsTags.PamDiscovery],
      params: z.object({ sourceId: z.string().uuid() }),
      body: z.object({
        name: slugSchema({ field: "Name" }).optional(),
        credentialAccountId: z.string().uuid().optional(),
        gatewayId: z.string().uuid().nullable().optional(),
        gatewayPoolId: z.string().uuid().nullable().optional(),
        schedule: z.nativeEnum(PamDiscoverySchedule).optional(),
        configuration: config.configuration.optional()
      }),
      response: { 200: z.object({ source: SourceSchema }) }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const source = await server.services.pamDiscovery.update({
        sourceId: req.params.sourceId,
        discoveryType,
        ...req.body,
        projectId: req.internalPamProjectId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalPamProjectId,
        event: {
          type: EventType.PAM_DISCOVERY_SOURCE_UPDATE,
          metadata: { sourceId: source.id, discoveryType }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.PamDiscoverySourceUpdated,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: { discoveryType, orgId: req.permission.orgId }
        })
        .catch(() => {});

      return { source };
    }
  });

  server.route({
    method: "GET",
    url: "/:sourceId",
    schema: {
      operationId: `get${typeId}PamDiscoverySource`,
      description: `Get a ${discoveryType} PAM discovery source`,
      tags: [ApiDocsTags.PamDiscovery],
      params: z.object({ sourceId: z.string().uuid() }),
      response: { 200: z.object({ source: SourceSchema }) }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const source = await server.services.pamDiscovery.getById({
        sourceId: req.params.sourceId,
        discoveryType,
        projectId: req.internalPamProjectId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });
      return { source };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:sourceId",
    schema: {
      operationId: `delete${typeId}PamDiscoverySource`,
      description: `Delete a ${discoveryType} PAM discovery source`,
      tags: [ApiDocsTags.PamDiscovery],
      params: z.object({ sourceId: z.string().uuid() }),
      response: { 200: z.object({ source: SourceSchema }) }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const source = await server.services.pamDiscovery.deleteSource({
        sourceId: req.params.sourceId,
        discoveryType,
        projectId: req.internalPamProjectId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalPamProjectId,
        event: {
          type: EventType.PAM_DISCOVERY_SOURCE_DELETE,
          metadata: { sourceId: source.id, discoveryType }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.PamDiscoverySourceDeleted,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: { discoveryType, orgId: req.permission.orgId }
        })
        .catch(() => {});

      return { source };
    }
  });

  server.route({
    method: "POST",
    url: "/:sourceId/scan",
    schema: {
      operationId: `scan${typeId}PamDiscoverySource`,
      description: `Trigger a scan for a ${discoveryType} PAM discovery source`,
      tags: [ApiDocsTags.PamDiscovery],
      params: z.object({ sourceId: z.string().uuid() }),
      response: { 200: z.object({ message: z.string() }) }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.pamDiscovery.triggerScan({
        sourceId: req.params.sourceId,
        discoveryType,
        projectId: req.internalPamProjectId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalPamProjectId,
        event: {
          type: EventType.PAM_DISCOVERY_SCAN,
          metadata: { sourceId: req.params.sourceId, discoveryType }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.PamDiscoveryScanTriggered,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: { discoveryType, orgId: req.permission.orgId }
        })
        .catch(() => {});

      return result;
    }
  });
};

export const registerPamDiscoveryRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/types",
    schema: {
      operationId: "listPamDiscoveryTypes",
      description: "List supported PAM discovery source types",
      tags: [ApiDocsTags.PamDiscovery],
      response: { 200: z.object({ discoveryTypes: z.array(PamDiscoveryTypeMetadataSchema) }) }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async () => ({ discoveryTypes: buildPamDiscoveryTypeMetadata() })
  });

  server.route({
    method: "GET",
    url: "/",
    schema: {
      operationId: "listPamDiscoverySources",
      description: "List PAM discovery sources",
      tags: [ApiDocsTags.PamDiscovery],
      querystring: z.object({ search: z.string().optional() }),
      response: { 200: z.object({ sources: z.array(SourceSchema) }) }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const sources = await server.services.pamDiscovery.list({
        projectId: req.internalPamProjectId,
        search: req.query.search,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });
      return { sources };
    }
  });

  server.route({
    method: "GET",
    url: "/:sourceId/runs",
    schema: {
      operationId: "listPamDiscoveryRuns",
      description: "List scan runs for a PAM discovery source",
      tags: [ApiDocsTags.PamDiscovery],
      params: z.object({ sourceId: z.string().uuid() }),
      querystring: z.object({
        offset: z.coerce.number().min(0).default(0).optional(),
        limit: z.coerce.number().min(1).max(100).default(20).optional()
      }),
      response: { 200: z.object({ runs: z.array(PamDiscoverySourceRunsSchema) }) }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const runs = await server.services.pamDiscovery.listRuns({
        sourceId: req.params.sourceId,
        projectId: req.internalPamProjectId,
        offset: req.query.offset,
        limit: req.query.limit,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });
      return { runs };
    }
  });

  server.route({
    method: "GET",
    url: "/:sourceId/discovered",
    schema: {
      operationId: "listPamDiscoveredAccounts",
      description: "List staged accounts discovered by a PAM discovery source",
      tags: [ApiDocsTags.PamDiscovery],
      params: z.object({ sourceId: z.string().uuid() }),
      querystring: z.object({
        search: z.string().optional(),
        offset: z.coerce.number().min(0).default(0).optional(),
        limit: z.coerce.number().min(1).max(100).default(20).optional()
      }),
      response: {
        200: z.object({ discoveredAccounts: z.array(DiscoveredAccountSchema), totalCount: z.number() })
      }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { discoveredAccounts, totalCount } = await server.services.pamDiscovery.listDiscovered({
        sourceId: req.params.sourceId,
        projectId: req.internalPamProjectId,
        search: req.query.search,
        offset: req.query.offset,
        limit: req.query.limit,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });
      return { discoveredAccounts, totalCount };
    }
  });

  server.route({
    method: "POST",
    url: "/:sourceId/discovered/import",
    schema: {
      operationId: "importPamDiscoveredAccounts",
      description: "Import staged accounts into a folder",
      tags: [ApiDocsTags.PamDiscovery],
      params: z.object({ sourceId: z.string().uuid() }),
      body: z.object({
        folderId: z.string().uuid(),
        accounts: z
          .object({
            discoveredAccountId: z.string().uuid(),
            templateId: z.string().uuid(),
            name: slugSchema({ field: "Name" }).optional()
          })
          .array()
          .min(1)
          .max(1000)
      }),
      response: {
        200: z.object({
          results: z
            .object({
              discoveredAccountId: z.string(),
              status: z.nativeEnum(PamDiscoveryImportStatus),
              accountId: z.string().optional(),
              name: z.string().optional(),
              message: z.string().optional()
            })
            .array()
        })
      }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { results } = await server.services.pamDiscovery.importAccounts({
        sourceId: req.params.sourceId,
        folderId: req.body.folderId,
        accounts: req.body.accounts,
        projectId: req.internalPamProjectId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      const importedAccounts = results.flatMap((r) =>
        r.status === PamDiscoveryImportStatus.Imported
          ? [{ discoveredAccountId: r.discoveredAccountId, accountId: r.accountId, name: r.name }]
          : []
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalPamProjectId,
        event: {
          type: EventType.PAM_DISCOVERED_ACCOUNT_IMPORT,
          metadata: {
            sourceId: req.params.sourceId,
            folderId: req.body.folderId,
            importedCount: importedAccounts.length,
            importedAccounts
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.PamDiscoveredAccountsImported,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: { orgId: req.permission.orgId, importedCount: importedAccounts.length }
        })
        .catch(() => {});

      return { results };
    }
  });

  await server.register(async (typeRouter) => {
    for (const [discoveryType, config] of Object.entries(DISCOVERY_TYPE_CONFIGS) as [
      TSupportedDiscoveryType,
      TSupportedConfigs[TSupportedDiscoveryType]
    ][]) {
      registerPerTypeEndpoints(withRoutePrefix(typeRouter, `/${discoveryType}`), discoveryType, config);
    }
  });
};
