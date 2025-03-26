import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { SecretSyncs } from "@app/lib/api-docs";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import {
  AwsParameterStoreSyncListItemSchema,
  AwsParameterStoreSyncSchema
} from "@app/services/secret-sync/aws-parameter-store";
import {
  AwsSecretsManagerSyncListItemSchema,
  AwsSecretsManagerSyncSchema
} from "@app/services/secret-sync/aws-secrets-manager";
import {
  AzureAppConfigurationSyncListItemSchema,
  AzureAppConfigurationSyncSchema
} from "@app/services/secret-sync/azure-app-configuration";
import { AzureKeyVaultSyncListItemSchema, AzureKeyVaultSyncSchema } from "@app/services/secret-sync/azure-key-vault";
import { DatabricksSyncListItemSchema, DatabricksSyncSchema } from "@app/services/secret-sync/databricks";
import { GcpSyncListItemSchema, GcpSyncSchema } from "@app/services/secret-sync/gcp";
import { GitHubSyncListItemSchema, GitHubSyncSchema } from "@app/services/secret-sync/github";
import { HumanitecSyncListItemSchema, HumanitecSyncSchema } from "@app/services/secret-sync/humanitec";

const SecretSyncSchema = z.discriminatedUnion("destination", [
  AwsParameterStoreSyncSchema,
  AwsSecretsManagerSyncSchema,
  GitHubSyncSchema,
  GcpSyncSchema,
  AzureKeyVaultSyncSchema,
  AzureAppConfigurationSyncSchema,
  DatabricksSyncSchema,
  HumanitecSyncSchema
]);

const SecretSyncOptionsSchema = z.discriminatedUnion("destination", [
  AwsParameterStoreSyncListItemSchema,
  AwsSecretsManagerSyncListItemSchema,
  GitHubSyncListItemSchema,
  GcpSyncListItemSchema,
  AzureKeyVaultSyncListItemSchema,
  AzureAppConfigurationSyncListItemSchema,
  DatabricksSyncListItemSchema,
  HumanitecSyncListItemSchema
]);

export const registerSecretSyncRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/options",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "List the available Secret Sync Options.",
      response: {
        200: z.object({
          secretSyncOptions: SecretSyncOptionsSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: () => {
      const secretSyncOptions = server.services.secretSync.listSecretSyncOptions();
      return { secretSyncOptions };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "List all the Secret Syncs for the specified project.",
      querystring: z.object({
        projectId: z.string().trim().min(1, "Project ID required").describe(SecretSyncs.LIST().projectId)
      }),
      response: {
        200: z.object({ secretSyncs: SecretSyncSchema.array() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        query: { projectId },
        permission
      } = req;

      const secretSyncs = await server.services.secretSync.listSecretSyncsByProjectId({ projectId }, permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.GET_SECRET_SYNCS,
          metadata: {
            syncIds: secretSyncs.map((sync) => sync.id),
            count: secretSyncs.length
          }
        }
      });

      return { secretSyncs };
    }
  });
};
