import { z } from "zod";

import { SecretScanningConfigsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { BitbucketDataSourceListItemSchema } from "@app/ee/services/secret-scanning-v2/bitbucket";
import { GitHubDataSourceListItemSchema } from "@app/ee/services/secret-scanning-v2/github";
import { GitLabDataSourceListItemSchema } from "@app/ee/services/secret-scanning-v2/gitlab";
import {
  SecretScanningFindingStatus,
  SecretScanningScanStatus
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import {
  SecretScanningDataSourceSchema,
  SecretScanningFindingSchema
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-union-schemas";
import {
  ApiDocsTags,
  SecretScanningConfigs,
  SecretScanningDataSources,
  SecretScanningFindings
} from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const SecretScanningDataSourceOptionsSchema = z.discriminatedUnion("type", [
  GitHubDataSourceListItemSchema,
  BitbucketDataSourceListItemSchema,
  GitLabDataSourceListItemSchema
]);

export const registerSecretScanningV2Router = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/data-sources/options",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listSecretScanningDataSourceOptions",
      tags: [ApiDocsTags.SecretScanning],
      description: "List the available Secret Scanning Data Source Options.",
      response: {
        200: z.object({
          dataSourceOptions: SecretScanningDataSourceOptionsSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: () => {
      const dataSourceOptions = server.services.secretScanningV2.listSecretScanningDataSourceOptions();
      return { dataSourceOptions };
    }
  });

  server.route({
    method: "GET",
    url: "/data-sources",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listSecretScanningDataSources",
      tags: [ApiDocsTags.SecretScanning],
      description: "List all the Secret Scanning Data Sources for the specified project.",
      querystring: z.object({
        projectId: z.string().trim().min(1, "Project ID required").describe(SecretScanningDataSources.LIST().projectId)
      }),
      response: {
        200: z.object({ dataSources: SecretScanningDataSourceSchema.array() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        query: { projectId },
        permission
      } = req;

      const dataSources = await server.services.secretScanningV2.listSecretScanningDataSourcesByProjectId(
        { projectId },
        permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.SECRET_SCANNING_DATA_SOURCE_LIST,
          metadata: {
            dataSourceIds: dataSources.map((dataSource) => dataSource.id),
            count: dataSources.length
          }
        }
      });

      return { dataSources };
    }
  });

  server.route({
    method: "GET",
    url: "/findings",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listSecretScanningFindings",
      tags: [ApiDocsTags.SecretScanning],
      description: "List all the Secret Scanning Findings for the specified project.",
      querystring: z.object({
        projectId: z.string().trim().min(1, "Project ID required").describe(SecretScanningFindings.LIST.projectId)
      }),
      response: {
        200: z.object({ findings: SecretScanningFindingSchema.array() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        query: { projectId },
        permission
      } = req;

      const findings = await server.services.secretScanningV2.listSecretScanningFindingsByProjectId(
        projectId,
        permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.SECRET_SCANNING_FINDING_LIST,
          metadata: {
            findingIds: findings.map((finding) => finding.id),
            count: findings.length
          }
        }
      });

      return { findings };
    }
  });

  server.route({
    method: "PATCH",
    url: "/findings/:findingId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "updateSecretScanningFinding",
      tags: [ApiDocsTags.SecretScanning],
      description: "Update the specified Secret Scanning Finding.",
      params: z.object({
        findingId: z.string().trim().min(1, "Finding ID required").describe(SecretScanningFindings.UPDATE.findingId)
      }),
      body: z.object({
        status: z.nativeEnum(SecretScanningFindingStatus).optional().describe(SecretScanningFindings.UPDATE.status),
        remarks: z.string().nullish().describe(SecretScanningFindings.UPDATE.remarks)
      }),
      response: {
        200: z.object({ finding: SecretScanningFindingSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        params: { findingId },
        body,
        permission
      } = req;

      const { finding, projectId } = await server.services.secretScanningV2.updateSecretScanningFindingById(
        { findingId, ...body },
        permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.SECRET_SCANNING_FINDING_UPDATE,
          metadata: {
            findingId,
            ...body
          }
        }
      });

      return { finding };
    }
  });

  server.route({
    method: "PATCH",
    url: "/findings",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "updateSecretScanningFindingsBatch",
      tags: [ApiDocsTags.SecretScanning],
      description: "Update one or more Secret Scanning Findings in a batch.",
      body: z
        .object({
          findingId: z.string().trim().min(1, "Finding ID required").describe(SecretScanningFindings.UPDATE.findingId),
          status: z.nativeEnum(SecretScanningFindingStatus).optional().describe(SecretScanningFindings.UPDATE.status),
          remarks: z.string().nullish().describe(SecretScanningFindings.UPDATE.remarks)
        })
        .array()
        .max(500),
      response: {
        200: z.object({ findings: SecretScanningFindingSchema.array() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { body, permission } = req;

      const updatedFindingPromises = body.map(async (findingUpdatePayload) => {
        const { finding, projectId } = await server.services.secretScanningV2.updateSecretScanningFindingById(
          findingUpdatePayload,
          permission
        );

        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          projectId,
          event: {
            type: EventType.SECRET_SCANNING_FINDING_UPDATE,
            metadata: findingUpdatePayload
          }
        });

        return finding;
      });

      const findings = await Promise.all(updatedFindingPromises);

      return { findings };
    }
  });

  server.route({
    method: "GET",
    url: "/configs",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "getSecretScanningConfig",
      tags: [ApiDocsTags.SecretScanning],
      description: "Get the Secret Scanning Config for the specified project.",
      querystring: z.object({
        projectId: z
          .string()
          .trim()
          .min(1, "Project ID required")
          .describe(SecretScanningConfigs.GET_BY_PROJECT_ID.projectId)
      }),
      response: {
        200: z.object({
          config: z.object({ content: z.string().nullish(), projectId: z.string(), updatedAt: z.date().nullish() })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        query: { projectId },
        permission
      } = req;

      const config = await server.services.secretScanningV2.findSecretScanningConfigByProjectId(projectId, permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.SECRET_SCANNING_CONFIG_GET
        }
      });

      return { config };
    }
  });

  server.route({
    method: "PATCH",
    url: "/configs",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "updateSecretScanningConfig",
      tags: [ApiDocsTags.SecretScanning],
      description: "Update the specified Secret Scanning Configuration.",
      querystring: z.object({
        projectId: z.string().trim().min(1, "Project ID required").describe(SecretScanningConfigs.UPDATE.projectId)
      }),
      body: z.object({
        content: z.string().nullable().describe(SecretScanningConfigs.UPDATE.content)
      }),
      response: {
        200: z.object({ config: SecretScanningConfigsSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        query: { projectId },
        body,
        permission
      } = req;

      const config = await server.services.secretScanningV2.upsertSecretScanningConfig(
        { projectId, ...body },
        permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.SECRET_SCANNING_CONFIG_UPDATE,
          metadata: body
        }
      });

      return { config };
    }
  });

  // not exposed, for UI only
  server.route({
    method: "GET",
    url: "/data-sources-dashboard",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listSecretScanningDataSourcesDashboard",
      querystring: z.object({
        projectId: z.string().trim().min(1, "Project ID required")
      }),
      response: {
        200: z.object({
          dataSources: z
            .intersection(
              SecretScanningDataSourceSchema,
              z.object({
                lastScannedAt: z.date().nullish(),
                lastScanStatus: z.nativeEnum(SecretScanningScanStatus).nullish(),
                lastScanStatusMessage: z.string().nullish(),
                unresolvedFindings: z.number().nullish()
              })
            )
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const {
        query: { projectId },
        permission
      } = req;

      const dataSources = await server.services.secretScanningV2.listSecretScanningDataSourcesWithDetailsByProjectId(
        { projectId },
        permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.SECRET_SCANNING_DATA_SOURCE_LIST,
          metadata: {
            dataSourceIds: dataSources.map((dataSource) => dataSource.id),
            count: dataSources.length
          }
        }
      });

      return { dataSources };
    }
  });

  server.route({
    method: "GET",
    url: "/unresolved-findings-count",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getSecretScanningUnresolvedFindingsCount",
      tags: [ApiDocsTags.SecretScanning],
      querystring: z.object({
        projectId: z.string().trim().min(1, "Project ID required").describe(SecretScanningFindings.LIST.projectId)
      }),
      response: {
        200: z.object({ unresolvedFindings: z.number() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const {
        query: { projectId },
        permission
      } = req;

      const unresolvedFindings =
        await server.services.secretScanningV2.getSecretScanningUnresolvedFindingsCountByProjectId(
          projectId,
          permission
        );

      return { unresolvedFindings };
    }
  });
};
