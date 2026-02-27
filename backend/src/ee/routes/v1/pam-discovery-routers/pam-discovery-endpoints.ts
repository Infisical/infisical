import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { PamDiscoveryType } from "@app/ee/services/pam-discovery/pam-discovery-enums";
import {
  DiscoveredAccountSchema,
  DiscoveredResourceSchema
} from "@app/ee/services/pam-discovery/pam-discovery-schemas";
import { TPamDiscoverySource } from "@app/ee/services/pam-discovery/pam-discovery-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerPamDiscoveryEndpoints = <T extends TPamDiscoverySource>({
  server,
  discoveryType,
  createDiscoverySourceSchema,
  updateDiscoverySourceSchema,
  discoveryResponseSchema,
  discoveryRunResponseSchema
}: {
  server: FastifyZodProvider;
  discoveryType: PamDiscoveryType;
  createDiscoverySourceSchema: z.ZodType<{
    name: T["name"];
    projectId: T["projectId"];
    discoveryConfiguration: T["discoveryConfiguration"];
    discoveryCredentials: T["discoveryCredentials"];
    schedule: T["schedule"];
    gatewayId: T["gatewayId"];
  }>;
  updateDiscoverySourceSchema: z.ZodType<{
    name?: T["name"];
    discoveryConfiguration?: T["discoveryConfiguration"];
    discoveryCredentials?: T["discoveryCredentials"];
    schedule?: T["schedule"];
    gatewayId?: T["gatewayId"];
  }>;
  discoveryResponseSchema: z.ZodTypeAny;
  discoveryRunResponseSchema: z.ZodTypeAny;
}) => {
  // Convert discovery type enum value to PascalCase for operation IDs
  // e.g., "active-directory" -> "ActiveDirectory"
  const discoveryTypeId = discoveryType
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

  server.route({
    method: "GET",
    url: "/:discoverySourceId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: `get${discoveryTypeId}PamDiscoverySource`,
      description: "Get PAM Discovery Source",
      params: z.object({
        discoverySourceId: z.string().uuid()
      }),
      response: {
        200: z.object({
          source: discoveryResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const source = await server.services.pamDiscoverySource.getById(
        req.params.discoverySourceId,
        discoveryType,
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: source.projectId,
        event: {
          type: EventType.PAM_DISCOVERY_SOURCE_GET,
          metadata: {
            sourceId: source.id,
            discoveryType: source.discoveryType,
            name: source.name
          }
        }
      });

      return { source };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: `create${discoveryTypeId}PamDiscoverySource`,
      description: "Create PAM Discovery Source",
      body: createDiscoverySourceSchema,
      response: {
        200: z.object({
          source: discoveryResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const source = await server.services.pamDiscoverySource.create(
        {
          ...req.body,
          discoveryType
        },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.body.projectId,
        event: {
          type: EventType.PAM_DISCOVERY_SOURCE_CREATE,
          metadata: {
            discoveryType,
            gatewayId: req.body.gatewayId,
            name: req.body.name
          }
        }
      });

      return { source };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:discoverySourceId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: `update${discoveryTypeId}PamDiscoverySource`,
      description: "Update PAM Discovery Source",
      params: z.object({
        discoverySourceId: z.string().uuid()
      }),
      body: updateDiscoverySourceSchema,
      response: {
        200: z.object({
          source: discoveryResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const source = await server.services.pamDiscoverySource.updateById(
        {
          ...req.body,
          discoverySourceId: req.params.discoverySourceId
        },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: source.projectId,
        event: {
          type: EventType.PAM_DISCOVERY_SOURCE_UPDATE,
          metadata: {
            sourceId: req.params.discoverySourceId,
            discoveryType,
            ...(req.body.gatewayId && { gatewayId: req.body.gatewayId }),
            ...(req.body.name && { name: req.body.name })
          }
        }
      });

      return { source };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:discoverySourceId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: `delete${discoveryTypeId}PamDiscoverySource`,
      description: "Delete PAM Discovery Source",
      params: z.object({
        discoverySourceId: z.string().uuid()
      }),
      response: {
        200: z.object({
          source: discoveryResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const source = await server.services.pamDiscoverySource.deleteById(req.params.discoverySourceId, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: source.projectId,
        event: {
          type: EventType.PAM_DISCOVERY_SOURCE_DELETE,
          metadata: {
            sourceId: req.params.discoverySourceId,
            discoveryType
          }
        }
      });

      return { source };
    }
  });

  server.route({
    method: "POST",
    url: "/:discoverySourceId/scan",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: `trigger${discoveryTypeId}PamDiscoverySourceScan`,
      description: "Trigger PAM Discovery Source scan",
      params: z.object({
        discoverySourceId: z.string().uuid()
      }),
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { message, discoverySource } = await server.services.pamDiscoverySource.triggerScanById(
        req.params.discoverySourceId,
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: discoverySource.projectId,
        event: {
          type: EventType.PAM_DISCOVERY_SCAN,
          metadata: {
            sourceId: req.params.discoverySourceId,
            discoveryType
          }
        }
      });

      return { message };
    }
  });

  server.route({
    method: "GET",
    url: "/:discoverySourceId/runs",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: `get${discoveryTypeId}PamDiscoverySourceRuns`,
      description: "Get PAM Discovery Source runs",
      params: z.object({
        discoverySourceId: z.string().uuid()
      }),
      querystring: z.object({
        offset: z.coerce.number().min(0).default(0),
        limit: z.coerce.number().min(1).max(100).default(25)
      }),
      response: {
        200: z.object({
          runs: discoveryRunResponseSchema.array(),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { runs, totalCount, discoverySource } = await server.services.pamDiscoverySource.getDiscoveryRuns(
        {
          ...req.query,
          discoverySourceId: req.params.discoverySourceId
        },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: discoverySource.projectId,
        event: {
          type: EventType.PAM_DISCOVERY_SOURCE_RUN_LIST,
          metadata: {
            sourceId: req.params.discoverySourceId,
            discoveryType,
            count: totalCount
          }
        }
      });

      return { runs, totalCount };
    }
  });

  server.route({
    method: "GET",
    url: "/:discoverySourceId/runs/:runId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: `get${discoveryTypeId}PamDiscoverySourceRun`,
      description: "Get PAM Discovery Source run",
      params: z.object({
        discoverySourceId: z.string().uuid(),
        runId: z.string().uuid()
      }),
      response: {
        200: z.object({
          run: discoveryRunResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { run, discoverySource } = await server.services.pamDiscoverySource.getDiscoveryRunById(
        req.params,
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: discoverySource.projectId,
        event: {
          type: EventType.PAM_DISCOVERY_SOURCE_RUN_GET,
          metadata: {
            sourceId: discoverySource.id,
            discoveryType,
            runId: run.id
          }
        }
      });

      return { run };
    }
  });

  server.route({
    method: "GET",
    url: "/:discoverySourceId/resources",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: `get${discoveryTypeId}PamDiscoverySourceResources`,
      description: "Get PAM Discovery Source resources",
      params: z.object({
        discoverySourceId: z.string().uuid()
      }),
      querystring: z.object({
        offset: z.coerce.number().min(0).default(0),
        limit: z.coerce.number().min(1).max(100).default(25)
      }),
      response: {
        200: z.object({
          resources: DiscoveredResourceSchema.array(),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { resources, totalCount, discoverySource } =
        await server.services.pamDiscoverySource.getDiscoveredResources(
          {
            ...req.query,
            discoverySourceId: req.params.discoverySourceId
          },
          req.permission
        );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: discoverySource.projectId,
        event: {
          type: EventType.PAM_DISCOVERY_SOURCE_RESOURCE_LIST,
          metadata: {
            sourceId: req.params.discoverySourceId,
            discoveryType,
            count: totalCount
          }
        }
      });

      return { resources, totalCount };
    }
  });

  server.route({
    method: "GET",
    url: "/:discoverySourceId/accounts",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: `get${discoveryTypeId}PamDiscoverySourceAccounts`,
      description: "Get PAM Discovery Source accounts",
      params: z.object({
        discoverySourceId: z.string().uuid()
      }),
      querystring: z.object({
        offset: z.coerce.number().min(0).default(0),
        limit: z.coerce.number().min(1).max(100).default(25)
      }),
      response: {
        200: z.object({
          accounts: DiscoveredAccountSchema.array(),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { accounts, totalCount, discoverySource } = await server.services.pamDiscoverySource.getDiscoveredAccounts(
        {
          ...req.query,
          discoverySourceId: req.params.discoverySourceId
        },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: discoverySource.projectId,
        event: {
          type: EventType.PAM_DISCOVERY_SOURCE_ACCOUNT_LIST,
          metadata: {
            sourceId: req.params.discoverySourceId,
            discoveryType,
            count: totalCount
          }
        }
      });

      return { accounts, totalCount };
    }
  });
};
