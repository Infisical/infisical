import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { GitHubDataSourceListItemSchema } from "@app/ee/services/secret-scanning-v2/github";
import { GitLabDataSourceListItemSchema } from "@app/ee/services/secret-scanning-v2/gitlab";
import { SecretScanningScanStatus } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { SecretScanningDataSourceSchema } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-union-schema";
import { ApiDocsTags, SecretScanningDataSources } from "@app/lib/api-docs";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const SecretScanningDataSourceOptionsSchema = z.discriminatedUnion("type", [
  GitHubDataSourceListItemSchema,
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
            dataSourceIds: dataSources.map((sync) => sync.id),
            count: dataSources.length
          }
        }
      });

      return { dataSources };
    }
  });

  // this is not exposed and for UI only
  server.route({
    method: "GET",
    url: "/data-sources-dashboard",
    config: {
      rateLimit: readLimit
    },
    schema: {
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
                unresolvedFindings: z.number()
              })
            )
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
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
            dataSourceIds: dataSources.map((sync) => sync.id),
            count: dataSources.length
          }
        }
      });

      return { dataSources };
    }
  });
};
