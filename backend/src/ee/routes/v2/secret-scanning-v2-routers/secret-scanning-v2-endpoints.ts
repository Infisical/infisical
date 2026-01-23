import { z } from "zod";

import { SecretScanningResourcesSchema } from "@app/db/schemas/secret-scanning-resources";
import { SecretScanningScansSchema } from "@app/db/schemas/secret-scanning-scans";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import {
  SecretScanningDataSource,
  SecretScanningScanStatus
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { SECRET_SCANNING_DATA_SOURCE_NAME_MAP } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-maps";
import {
  TSecretScanningDataSource,
  TSecretScanningDataSourceInput
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-types";
import { ApiDocsTags, SecretScanningDataSources } from "@app/lib/api-docs";
import { startsWithVowel } from "@app/lib/fn";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerSecretScanningEndpoints = <
  T extends TSecretScanningDataSource,
  I extends TSecretScanningDataSourceInput
>({
  server,
  type,
  createSchema,
  updateSchema,
  responseSchema
}: {
  type: SecretScanningDataSource;
  server: FastifyZodProvider;
  createSchema: z.ZodType<{
    name: string;
    projectId: string;
    connectionId?: string;
    config: Partial<I["config"]>;
    description?: string | null;
    isAutoScanEnabled?: boolean;
  }>;
  updateSchema: z.ZodType<{
    name?: string;
    config?: Partial<I["config"]>;
    description?: string | null;
    isAutoScanEnabled?: boolean;
  }>;
  responseSchema: z.ZodTypeAny;
}) => {
  const sourceType = SECRET_SCANNING_DATA_SOURCE_NAME_MAP[type];
  const sourceTypeId = sourceType.replace(/\s+/g, "");

  server.route({
    method: "GET",
    url: `/`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: `list${sourceTypeId}DataSources`,
      tags: [ApiDocsTags.SecretScanning],
      description: `List the ${sourceType} Data Sources for the specified project.`,
      querystring: z.object({
        projectId: z
          .string()
          .trim()
          .min(1, "Project ID required")
          .describe(SecretScanningDataSources.LIST(type).projectId)
      }),
      response: {
        200: z.object({ dataSources: responseSchema.array() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        query: { projectId }
      } = req;

      const dataSources = (await server.services.secretScanningV2.listSecretScanningDataSourcesByProjectId(
        { projectId, type },
        req.permission
      )) as T[];

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.SECRET_SCANNING_DATA_SOURCE_LIST,
          metadata: {
            type,
            count: dataSources.length,
            dataSourceIds: dataSources.map((source) => source.id)
          }
        }
      });

      return { dataSources };
    }
  });

  server.route({
    method: "GET",
    url: "/:dataSourceId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: `get${sourceTypeId}DataSource`,
      tags: [ApiDocsTags.SecretScanning],
      description: `Get the specified ${sourceType} Data Source by ID.`,
      params: z.object({
        dataSourceId: z.string().uuid().describe(SecretScanningDataSources.GET_BY_ID(type).dataSourceId)
      }),
      response: {
        200: z.object({ dataSource: responseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { dataSourceId } = req.params;

      const dataSource = (await server.services.secretScanningV2.findSecretScanningDataSourceById(
        { dataSourceId, type },
        req.permission
      )) as T;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: dataSource.projectId,
        event: {
          type: EventType.SECRET_SCANNING_DATA_SOURCE_GET,
          metadata: {
            dataSourceId,
            type
          }
        }
      });

      return { dataSource };
    }
  });

  server.route({
    method: "GET",
    url: "/data-source-name/:sourceName",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: `get${sourceTypeId}DataSourceByName`,
      tags: [ApiDocsTags.SecretScanning],
      description: `Get the specified ${sourceType} Data Source by name and project ID.`,
      params: z.object({
        sourceName: z
          .string()
          .trim()
          .min(1, "Data Source name required")
          .describe(SecretScanningDataSources.GET_BY_NAME(type).sourceName)
      }),
      querystring: z.object({
        projectId: z
          .string()
          .trim()
          .min(1, "Project ID required")
          .describe(SecretScanningDataSources.GET_BY_NAME(type).projectId)
      }),
      response: {
        200: z.object({ dataSource: responseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { sourceName } = req.params;
      const { projectId } = req.query;

      const dataSource = (await server.services.secretScanningV2.findSecretScanningDataSourceByName(
        { sourceName, projectId, type },
        req.permission
      )) as T;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.SECRET_SCANNING_DATA_SOURCE_GET,
          metadata: {
            dataSourceId: dataSource.id,
            type
          }
        }
      });

      return { dataSource };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: `create${sourceTypeId}DataSource`,
      tags: [ApiDocsTags.SecretScanning],
      description: `Create ${
        startsWithVowel(sourceType) ? "an" : "a"
      } ${sourceType} Data Source for the specified project.`,
      body: createSchema,
      response: {
        200: z.object({ dataSource: responseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const dataSource = (await server.services.secretScanningV2.createSecretScanningDataSource(
        { ...req.body, type },
        req.permission
      )) as T;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: dataSource.projectId,
        event: {
          type: EventType.SECRET_SCANNING_DATA_SOURCE_CREATE,
          metadata: {
            dataSourceId: dataSource.id,
            type,
            ...req.body
          }
        }
      });

      return { dataSource };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:dataSourceId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: `update${sourceTypeId}DataSource`,
      tags: [ApiDocsTags.SecretScanning],
      description: `Update the specified ${sourceType} Data Source.`,
      params: z.object({
        dataSourceId: z.string().uuid().describe(SecretScanningDataSources.UPDATE(type).dataSourceId)
      }),
      body: updateSchema,
      response: {
        200: z.object({ dataSource: responseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { dataSourceId } = req.params;

      const dataSource = (await server.services.secretScanningV2.updateSecretScanningDataSource(
        { ...req.body, dataSourceId, type },
        req.permission
      )) as T;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: dataSource.projectId,
        event: {
          type: EventType.SECRET_SCANNING_DATA_SOURCE_UPDATE,
          metadata: {
            dataSourceId,
            type,
            ...req.body
          }
        }
      });

      return { dataSource };
    }
  });

  server.route({
    method: "DELETE",
    url: `/:dataSourceId`,
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: `delete${sourceTypeId}DataSource`,
      tags: [ApiDocsTags.SecretScanning],
      description: `Delete the specified ${sourceType} Data Source.`,
      params: z.object({
        dataSourceId: z.string().uuid().describe(SecretScanningDataSources.DELETE(type).dataSourceId)
      }),
      response: {
        200: z.object({ dataSource: responseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { dataSourceId } = req.params;

      const dataSource = (await server.services.secretScanningV2.deleteSecretScanningDataSource(
        { type, dataSourceId },
        req.permission
      )) as T;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: dataSource.projectId,
        event: {
          type: EventType.SECRET_SCANNING_DATA_SOURCE_DELETE,
          metadata: {
            type,
            dataSourceId
          }
        }
      });

      return { dataSource };
    }
  });

  server.route({
    method: "POST",
    url: `/:dataSourceId/scan`,
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: `trigger${sourceTypeId}DataSourceScan`,
      tags: [ApiDocsTags.SecretScanning],
      description: `Trigger a scan for the specified ${sourceType} Data Source.`,
      params: z.object({
        dataSourceId: z.string().uuid().describe(SecretScanningDataSources.SCAN(type).dataSourceId)
      }),
      response: {
        200: z.object({ dataSource: responseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { dataSourceId } = req.params;

      const dataSource = (await server.services.secretScanningV2.triggerSecretScanningDataSourceScan(
        { type, dataSourceId },
        req.permission
      )) as T;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: dataSource.projectId,
        event: {
          type: EventType.SECRET_SCANNING_DATA_SOURCE_TRIGGER_SCAN,
          metadata: {
            type,
            dataSourceId
          }
        }
      });

      return { dataSource };
    }
  });

  server.route({
    method: "POST",
    url: `/:dataSourceId/resources/:resourceId/scan`,
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: `trigger${sourceTypeId}DataSourceResourceScan`,
      tags: [ApiDocsTags.SecretScanning],
      description: `Trigger a scan for the specified ${sourceType} Data Source resource.`,
      params: z.object({
        dataSourceId: z.string().uuid().describe(SecretScanningDataSources.SCAN(type).dataSourceId),
        resourceId: z.string().uuid().describe(SecretScanningDataSources.SCAN(type).resourceId)
      }),
      response: {
        200: z.object({ dataSource: responseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { dataSourceId, resourceId } = req.params;

      const dataSource = (await server.services.secretScanningV2.triggerSecretScanningDataSourceScan(
        { type, dataSourceId, resourceId },
        req.permission
      )) as T;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: dataSource.projectId,
        event: {
          type: EventType.SECRET_SCANNING_DATA_SOURCE_TRIGGER_SCAN,
          metadata: {
            type,
            dataSourceId,
            resourceId
          }
        }
      });

      return { dataSource };
    }
  });

  server.route({
    method: "GET",
    url: "/:dataSourceId/resources",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: `list${sourceTypeId}DataSourceResources`,
      tags: [ApiDocsTags.SecretScanning],
      description: `Get the resources associated with the specified ${sourceType} Data Source by ID.`,
      params: z.object({
        dataSourceId: z.string().uuid().describe(SecretScanningDataSources.LIST_RESOURCES(type).dataSourceId)
      }),
      response: {
        200: z.object({ resources: SecretScanningResourcesSchema.array() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { dataSourceId } = req.params;

      const { resources, projectId } = await server.services.secretScanningV2.listSecretScanningResourcesByDataSourceId(
        { dataSourceId, type },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.SECRET_SCANNING_RESOURCE_LIST,
          metadata: {
            dataSourceId,
            type,
            resourceIds: resources.map((resource) => resource.id),
            count: resources.length
          }
        }
      });

      return { resources };
    }
  });

  server.route({
    method: "GET",
    url: "/:dataSourceId/scans",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: `list${sourceTypeId}DataSourceScans`,
      tags: [ApiDocsTags.SecretScanning],
      description: `Get the scans associated with the specified ${sourceType} Data Source by ID.`,
      params: z.object({
        dataSourceId: z.string().uuid().describe(SecretScanningDataSources.LIST_SCANS(type).dataSourceId)
      }),
      response: {
        200: z.object({ scans: SecretScanningScansSchema.array() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { dataSourceId } = req.params;

      const { scans, projectId } = await server.services.secretScanningV2.listSecretScanningScansByDataSourceId(
        { dataSourceId, type },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.SECRET_SCANNING_SCAN_LIST,
          metadata: {
            dataSourceId,
            type,
            count: scans.length
          }
        }
      });

      return { scans };
    }
  });

  // not exposed, for UI only
  server.route({
    method: "GET",
    url: "/:dataSourceId/resources-dashboard",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: `list${sourceTypeId}DataSourceResourcesDashboard`,
      tags: [ApiDocsTags.SecretScanning],
      params: z.object({
        dataSourceId: z.string().uuid()
      }),
      response: {
        200: z.object({
          resources: SecretScanningResourcesSchema.extend({
            lastScannedAt: z.date().nullish(),
            lastScanStatus: z.nativeEnum(SecretScanningScanStatus).nullish(),
            lastScanStatusMessage: z.string().nullish(),
            unresolvedFindings: z.number()
          }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { dataSourceId } = req.params;

      const { resources, projectId } =
        await server.services.secretScanningV2.listSecretScanningResourcesWithDetailsByDataSourceId(
          { dataSourceId, type },
          req.permission
        );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.SECRET_SCANNING_RESOURCE_LIST,
          metadata: {
            dataSourceId,
            type,
            resourceIds: resources.map((resource) => resource.id),
            count: resources.length
          }
        }
      });

      return { resources };
    }
  });

  server.route({
    method: "GET",
    url: "/:dataSourceId/scans-dashboard",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: `list${sourceTypeId}DataSourceScansDashboard`,
      tags: [ApiDocsTags.SecretScanning],
      params: z.object({
        dataSourceId: z.string().uuid()
      }),
      response: {
        200: z.object({
          scans: SecretScanningScansSchema.extend({
            unresolvedFindings: z.number(),
            resolvedFindings: z.number(),
            resourceName: z.string()
          }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { dataSourceId } = req.params;

      const { scans, projectId } =
        await server.services.secretScanningV2.listSecretScanningScansWithDetailsByDataSourceId(
          { dataSourceId, type },
          req.permission
        );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.SECRET_SCANNING_SCAN_LIST,
          metadata: {
            dataSourceId,
            type,
            count: scans.length
          }
        }
      });

      return { scans };
    }
  });
};
