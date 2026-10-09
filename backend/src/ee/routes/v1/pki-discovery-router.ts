import { z } from "zod";

import { PkiDiscoveryConfigsSchema, PkiDiscoveryScanHistorySchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import {
  DEFAULT_TLS_PORTS,
  MAX_DOMAINS,
  MAX_IPS,
  MAX_PORTS,
  MIN_CIDR_PREFIX
} from "@app/ee/services/pki-discovery/pki-discovery-fns";
import { DiscoveryTargetConfigInputSchema } from "@app/ee/services/pki-discovery/pki-discovery-schemas";
import { PkiDiscoveryType, TPkiDiscoveryTargetConfig } from "@app/ee/services/pki-discovery/pki-discovery-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { openApiHidden, slugSchema } from "@app/server/lib/schemas";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { AuthMode } from "@app/services/auth/auth-type";
import { pkiDescriptionSchema } from "@app/services/certificate-common/certificate-constants";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

const DiscoveryConnectionsSchema = z
  .array(z.object({ id: z.string().uuid(), name: z.string(), app: z.nativeEnum(AppConnection) }))
  .optional();

export const registerPkiDiscoveryRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/config",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiDiscovery],
      operationId: "getPkiDiscoveryConfig",
      description: "Get PKI discovery configuration limits and defaults",
      response: {
        200: z.object({
          defaultPorts: z.string(),
          maxPorts: z.number(),
          maxIps: z.number(),
          maxDomains: z.number(),
          minCidrPrefix: z.number()
        })
      }
    },
    handler: async () => {
      return {
        defaultPorts: DEFAULT_TLS_PORTS,
        maxPorts: MAX_PORTS,
        maxIps: MAX_IPS,
        maxDomains: MAX_DOMAINS,
        minCidrPrefix: MIN_CIDR_PREFIX
      };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiDiscovery],
      operationId: "createPkiDiscovery",
      description: "Create a new PKI discovery configuration",
      body: z
        .object({
          projectId: z.string().optional().describe(openApiHidden()),
          name: slugSchema({ field: "Name", max: 100 }).describe("Name of the discovery configuration"),
          description: pkiDescriptionSchema.optional().describe("Description of the discovery configuration"),
          discoveryType: z
            .nativeEnum(PkiDiscoveryType)
            .optional()
            .default(PkiDiscoveryType.Network)
            .describe("Type of discovery scan"),
          targetConfig: DiscoveryTargetConfigInputSchema,
          isAutoScanEnabled: z.boolean().optional().default(false).describe("Enable automatic scheduled scans"),
          scanIntervalDays: z.number().min(1).max(365).optional().describe("Interval in days between automatic scans"),
          gatewayId: z.string().uuid().optional().describe("Gateway ID for scanning private networks"),
          gatewayPoolId: z.string().uuid().optional().describe("Gateway pool ID for scanning private networks")
        })
        .superRefine((data, ctx) => {
          if (data.gatewayId && data.gatewayPoolId) {
            ctx.addIssue({
              path: ["gatewayPoolId"],
              code: z.ZodIssueCode.custom,
              message: "Cannot specify both a gateway and a gateway pool"
            });
          }
        }),
      response: {
        200: PkiDiscoveryConfigsSchema
      }
    },
    handler: async (req) => {
      const projectId = req.internalCertManagerProjectId;
      const discovery = await server.services.pkiDiscovery.createDiscovery({
        projectId,
        name: req.body.name,
        description: req.body.description,
        discoveryType: req.body.discoveryType,
        targetConfig: req.body.targetConfig as TPkiDiscoveryTargetConfig,
        isAutoScanEnabled: req.body.isAutoScanEnabled,
        scanIntervalDays: req.body.scanIntervalDays,
        gatewayId: req.body.gatewayId,
        gatewayPoolId: req.body.gatewayPoolId,
        orgActor: req.permission,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.CREATE_PKI_DISCOVERY,
          metadata: {
            discoveryId: discovery.id,
            name: discovery.name
          }
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.PkiDiscoveryCreated,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          orgId: req.permission.orgId,
          projectId,
          discoveryType: req.body.discoveryType
        }
      });

      return discovery;
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiDiscovery],
      operationId: "listPkiDiscoveries",
      description: "List PKI discovery configurations for a project",
      querystring: z.object({
        projectId: z.string().optional().describe(openApiHidden()),
        offset: z.coerce.number().min(0).optional().default(0).describe("Pagination offset"),
        limit: z.coerce.number().min(1).max(100).optional().default(25).describe("Pagination limit"),
        search: z.string().optional().describe("Search filter for name or description")
      }),
      response: {
        200: z.object({
          discoveries: z.array(
            PkiDiscoveryConfigsSchema.extend({
              certificatesFound: z.number(),
              installationsFound: z.number(),
              connections: DiscoveryConnectionsSchema
            })
          ),
          totalCount: z.number()
        })
      }
    },
    handler: async (req) => {
      const projectId = req.internalCertManagerProjectId;
      const { discoveries, totalCount } = await server.services.pkiDiscovery.listDiscoveries({
        projectId,
        offset: req.query.offset,
        limit: req.query.limit,
        search: req.query.search,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.GET_PKI_DISCOVERIES,
          metadata: {
            count: totalCount
          }
        }
      });

      return { discoveries, totalCount };
    }
  });

  server.route({
    method: "GET",
    url: "/:discoveryId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiDiscovery],
      operationId: "getPkiDiscovery",
      description: "Get a PKI discovery configuration by ID",
      params: z.object({
        discoveryId: z.string().uuid().describe("The ID of the discovery configuration")
      }),
      response: {
        200: PkiDiscoveryConfigsSchema.extend({
          linkedInstallationsCount: z.number().optional(),
          gatewayName: z.string().nullable().optional(),
          gatewayPoolName: z.string().nullable().optional(),
          connections: DiscoveryConnectionsSchema
        })
      }
    },
    handler: async (req) => {
      const discovery = await server.services.pkiDiscovery.getDiscovery({
        discoveryId: req.params.discoveryId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: discovery.projectId,
        event: {
          type: EventType.GET_PKI_DISCOVERY,
          metadata: {
            discoveryId: discovery.id,
            name: discovery.name
          }
        }
      });

      return discovery;
    }
  });

  server.route({
    method: "PATCH",
    url: "/:discoveryId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiDiscovery],
      operationId: "updatePkiDiscovery",
      description: "Update a PKI discovery configuration",
      params: z.object({
        discoveryId: z.string().uuid().describe("The ID of the discovery configuration")
      }),
      body: z
        .object({
          name: slugSchema({ field: "Name", max: 100 }).optional().describe("Name of the discovery configuration"),
          description: pkiDescriptionSchema
            .optional()
            .nullable()
            .describe("Description of the discovery configuration"),
          targetConfig: DiscoveryTargetConfigInputSchema.optional(),
          isAutoScanEnabled: z.boolean().optional().describe("Enable automatic scheduled scans"),
          scanIntervalDays: z
            .number()
            .min(1)
            .max(365)
            .optional()
            .nullable()
            .describe("Interval in days between automatic scans"),
          gatewayId: z.string().uuid().optional().nullable().describe("Gateway ID for scanning private networks"),
          gatewayPoolId: z
            .string()
            .uuid()
            .optional()
            .nullable()
            .describe("Gateway pool ID for scanning private networks"),
          isActive: z.boolean().optional().describe("Whether the discovery configuration is active")
        })
        .superRefine((data, ctx) => {
          if (data.gatewayId && data.gatewayPoolId) {
            ctx.addIssue({
              path: ["gatewayPoolId"],
              code: z.ZodIssueCode.custom,
              message: "Cannot specify both a gateway and a gateway pool"
            });
          }
        }),
      response: {
        200: PkiDiscoveryConfigsSchema
      }
    },
    handler: async (req) => {
      const discovery = await server.services.pkiDiscovery.updateDiscovery({
        discoveryId: req.params.discoveryId,
        name: req.body.name,
        description: req.body.description ?? undefined,
        targetConfig: req.body.targetConfig as TPkiDiscoveryTargetConfig | undefined,
        isAutoScanEnabled: req.body.isAutoScanEnabled,
        scanIntervalDays: req.body.scanIntervalDays ?? undefined,
        gatewayId: req.body.gatewayId,
        gatewayPoolId: req.body.gatewayPoolId,
        isActive: req.body.isActive,
        orgActor: req.permission,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: discovery.projectId,
        event: {
          type: EventType.UPDATE_PKI_DISCOVERY,
          metadata: {
            discoveryId: discovery.id,
            name: discovery.name
          }
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.PkiDiscoveryUpdated,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          orgId: req.permission.orgId,
          projectId: discovery.projectId
        }
      });

      return discovery;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:discoveryId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiDiscovery],
      operationId: "deletePkiDiscovery",
      description: "Delete a PKI discovery configuration",
      params: z.object({
        discoveryId: z.string().uuid().describe("The ID of the discovery configuration")
      }),
      response: {
        200: PkiDiscoveryConfigsSchema
      }
    },
    handler: async (req) => {
      const discovery = await server.services.pkiDiscovery.deleteDiscovery({
        discoveryId: req.params.discoveryId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: discovery.projectId,
        event: {
          type: EventType.DELETE_PKI_DISCOVERY,
          metadata: {
            discoveryId: discovery.id,
            name: discovery.name
          }
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.PkiDiscoveryDeleted,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          orgId: req.permission.orgId,
          projectId: discovery.projectId
        }
      });

      return discovery;
    }
  });

  server.route({
    method: "POST",
    url: "/:discoveryId/scan",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiDiscovery],
      operationId: "triggerPkiDiscoveryScan",
      description: "Trigger a manual PKI discovery scan",
      params: z.object({
        discoveryId: z.string().uuid().describe("The ID of the discovery configuration")
      }),
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    handler: async (req) => {
      const result = await server.services.pkiDiscovery.triggerScan({
        discoveryId: req.params.discoveryId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: result.projectId,
        event: {
          type: EventType.TRIGGER_PKI_DISCOVERY_SCAN,
          metadata: {
            discoveryId: req.params.discoveryId,
            name: result.name
          }
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.PkiDiscoveryScanTriggered,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          orgId: req.permission.orgId,
          projectId: result.projectId
        }
      });

      return result;
    }
  });

  server.route({
    method: "GET",
    url: "/:discoveryId/latest-scan",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiDiscovery],
      operationId: "getPkiDiscoveryLatestScan",
      description: "Get the latest scan for a PKI discovery configuration",
      params: z.object({
        discoveryId: z.string().uuid().describe("The ID of the discovery configuration")
      }),
      response: {
        200: PkiDiscoveryScanHistorySchema.nullable()
      }
    },
    handler: async (req) => {
      const latestScan = await server.services.pkiDiscovery.getLatestScan({
        discoveryId: req.params.discoveryId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return latestScan;
    }
  });

  server.route({
    method: "GET",
    url: "/:discoveryId/scans",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiDiscovery],
      operationId: "listPkiDiscoveryScans",
      description: "Get scan history for a PKI discovery configuration",
      params: z.object({
        discoveryId: z.string().uuid().describe("The ID of the discovery configuration")
      }),
      querystring: z.object({
        offset: z.coerce.number().min(0).optional().default(0).describe("Pagination offset"),
        limit: z.coerce.number().min(1).max(100).optional().default(25).describe("Pagination limit")
      }),
      response: {
        200: z.object({
          scans: z.array(PkiDiscoveryScanHistorySchema),
          totalCount: z.number()
        })
      }
    },
    handler: async (req) => {
      const { scans, totalCount } = await server.services.pkiDiscovery.getScanHistory({
        discoveryId: req.params.discoveryId,
        offset: req.query.offset,
        limit: req.query.limit,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { scans, totalCount };
    }
  });
};
