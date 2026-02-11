import RE2 from "re2";
import { z } from "zod";

import { PkiDiscoveryConfigsSchema, PkiDiscoveryScanHistorySchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import {
  DEFAULT_TLS_PORTS,
  MAX_DOMAINS,
  MAX_IPS,
  MAX_PORTS,
  MIN_CIDR_PREFIX,
  validateTargetConfig
} from "@app/ee/services/pki-discovery/pki-discovery-fns";
import { PkiDiscoveryType, TPkiDiscoveryTargetConfig } from "@app/ee/services/pki-discovery/pki-discovery-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { BadRequestError } from "@app/lib/errors";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const NetworkTargetConfigSchema = z
  .object({
    ipRanges: z.array(z.string()).optional(),
    domains: z.array(z.string()).optional(),
    ports: z.string().default(DEFAULT_TLS_PORTS)
  })
  .refine((data) => (data.ipRanges && data.ipRanges.length > 0) || (data.domains && data.domains.length > 0), {
    message: "At least one IP range or domain is required"
  });

export const registerPkiDiscoveryRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/config",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiDiscovery],
      operationId: "createPkiDiscovery",
      description: "Create a new PKI discovery configuration",
      body: z.object({
        projectId: z.string().describe("The ID of the project"),
        name: z
          .string()
          .min(1)
          .max(100)
          .regex(new RE2("^[a-z0-9-]+$"), "Name must contain only lowercase letters, numbers, and hyphens")
          .describe("Name of the discovery configuration"),
        description: z.string().max(500).optional().describe("Description of the discovery configuration"),
        discoveryType: z
          .nativeEnum(PkiDiscoveryType)
          .optional()
          .default(PkiDiscoveryType.Network)
          .describe("Type of discovery scan"),
        targetConfig: NetworkTargetConfigSchema.describe("Target configuration for discovery scans"),
        isAutoScanEnabled: z.boolean().optional().default(false).describe("Enable automatic scheduled scans"),
        scanIntervalDays: z.number().min(1).max(365).optional().describe("Interval in days between automatic scans"),
        gatewayId: z.string().uuid().optional().describe("Gateway ID for scanning private networks")
      }),
      response: {
        200: PkiDiscoveryConfigsSchema
      }
    },
    handler: async (req) => {
      const validation = validateTargetConfig(
        req.body.targetConfig.ipRanges,
        req.body.targetConfig.ports,
        req.body.targetConfig.domains,
        !!req.body.gatewayId
      );
      if (!validation.valid) {
        throw new BadRequestError({ message: validation.error || "Invalid target configuration" });
      }

      const discovery = await server.services.pkiDiscovery.createDiscovery({
        projectId: req.body.projectId,
        name: req.body.name,
        description: req.body.description,
        discoveryType: req.body.discoveryType,
        targetConfig: req.body.targetConfig as TPkiDiscoveryTargetConfig,
        isAutoScanEnabled: req.body.isAutoScanEnabled,
        scanIntervalDays: req.body.scanIntervalDays,
        gatewayId: req.body.gatewayId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.body.projectId,
        event: {
          type: EventType.CREATE_PKI_DISCOVERY,
          metadata: {
            discoveryId: discovery.id,
            name: discovery.name,
            projectId: req.body.projectId
          }
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiDiscovery],
      operationId: "listPkiDiscoveries",
      description: "List PKI discovery configurations for a project",
      querystring: z.object({
        projectId: z.string().describe("The ID of the project"),
        offset: z.coerce.number().min(0).optional().default(0).describe("Pagination offset"),
        limit: z.coerce.number().min(1).max(100).optional().default(25).describe("Pagination limit"),
        search: z.string().optional().describe("Search filter for name or description")
      }),
      response: {
        200: z.object({
          discoveries: z.array(PkiDiscoveryConfigsSchema),
          totalCount: z.number()
        })
      }
    },
    handler: async (req) => {
      const { discoveries, totalCount } = await server.services.pkiDiscovery.listDiscoveries({
        projectId: req.query.projectId,
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
        projectId: req.query.projectId,
        event: {
          type: EventType.GET_PKI_DISCOVERIES,
          metadata: {
            projectId: req.query.projectId,
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
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
          linkedInstallationsCount: z.number().optional()
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiDiscovery],
      operationId: "updatePkiDiscovery",
      description: "Update a PKI discovery configuration",
      params: z.object({
        discoveryId: z.string().uuid().describe("The ID of the discovery configuration")
      }),
      body: z.object({
        name: z
          .string()
          .min(1)
          .max(100)
          .regex(new RE2("^[a-z0-9-]+$"), "Name must contain only lowercase letters, numbers, and hyphens")
          .optional()
          .describe("Name of the discovery configuration"),
        description: z.string().max(500).optional().nullable().describe("Description of the discovery configuration"),
        targetConfig: NetworkTargetConfigSchema.optional().describe("Target configuration for discovery scans"),
        isAutoScanEnabled: z.boolean().optional().describe("Enable automatic scheduled scans"),
        scanIntervalDays: z
          .number()
          .min(1)
          .max(365)
          .optional()
          .nullable()
          .describe("Interval in days between automatic scans"),
        gatewayId: z.string().uuid().optional().nullable().describe("Gateway ID for scanning private networks"),
        isActive: z.boolean().optional().describe("Whether the discovery configuration is active")
      }),
      response: {
        200: PkiDiscoveryConfigsSchema
      }
    },
    handler: async (req) => {
      if (req.body.targetConfig) {
        const hasGateway = req.body.gatewayId !== null && req.body.gatewayId !== undefined;
        const validation = validateTargetConfig(
          req.body.targetConfig.ipRanges,
          req.body.targetConfig.ports,
          req.body.targetConfig.domains,
          hasGateway
        );
        if (!validation.valid) {
          throw new BadRequestError({ message: validation.error || "Invalid target configuration" });
        }
      }

      const discovery = await server.services.pkiDiscovery.updateDiscovery({
        discoveryId: req.params.discoveryId,
        name: req.body.name,
        description: req.body.description ?? undefined,
        targetConfig: req.body.targetConfig as TPkiDiscoveryTargetConfig | undefined,
        isAutoScanEnabled: req.body.isAutoScanEnabled,
        scanIntervalDays: req.body.scanIntervalDays ?? undefined,
        gatewayId: req.body.gatewayId,
        isActive: req.body.isActive,
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

      return discovery;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:discoveryId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
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

      return discovery;
    }
  });

  server.route({
    method: "POST",
    url: "/:discoveryId/scan",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
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

      return result;
    }
  });

  server.route({
    method: "GET",
    url: "/:discoveryId/latest-scan",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
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
