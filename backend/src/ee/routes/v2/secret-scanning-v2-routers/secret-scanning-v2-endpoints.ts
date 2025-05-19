import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { SecretScanningDataSource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
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
    config: I["config"];
    description?: string | null;
    isAutoScanEnabled?: boolean;
  }>;
  updateSchema: z.ZodType<{
    name?: string;
    config?: I["config"];
    description?: string | null;
    isAutoScanEnabled?: boolean;
  }>;
  responseSchema: z.ZodTypeAny;
}) => {
  const sourceType = SECRET_SCANNING_DATA_SOURCE_NAME_MAP[type];

  server.route({
    method: "GET",
    url: `/`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
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
    url: `/data-source-name/:sourceName`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
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
      tags: [ApiDocsTags.SecretScanning],
      description: `Delete the specified ${sourceType} Rotation.`,
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

      const dataSource = (await server.services.secretScanningV2.deleteSecretScanningResource(
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
};
