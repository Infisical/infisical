import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, SecretSyncs } from "@app/lib/api-docs";
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
import { CamundaSyncListItemSchema, CamundaSyncSchema } from "@app/services/secret-sync/camunda";
import { DatabricksSyncListItemSchema, DatabricksSyncSchema } from "@app/services/secret-sync/databricks";
import { GcpSyncListItemSchema, GcpSyncSchema } from "@app/services/secret-sync/gcp";
import { GitHubSyncListItemSchema, GitHubSyncSchema } from "@app/services/secret-sync/github";
import { HCVaultSyncListItemSchema, HCVaultSyncSchema } from "@app/services/secret-sync/hc-vault";
import { HumanitecSyncListItemSchema, HumanitecSyncSchema } from "@app/services/secret-sync/humanitec";
import { OCIVaultSyncListItemSchema, OCIVaultSyncSchema } from "@app/services/secret-sync/oci-vault";
import { TeamCitySyncListItemSchema, TeamCitySyncSchema } from "@app/services/secret-sync/teamcity";
import { TerraformCloudSyncListItemSchema, TerraformCloudSyncSchema } from "@app/services/secret-sync/terraform-cloud";
import { VercelSyncListItemSchema, VercelSyncSchema } from "@app/services/secret-sync/vercel";
import { WindmillSyncListItemSchema, WindmillSyncSchema } from "@app/services/secret-sync/windmill";

const SecretSyncSchema = z.discriminatedUnion("destination", [
  AwsParameterStoreSyncSchema,
  AwsSecretsManagerSyncSchema,
  GitHubSyncSchema,
  GcpSyncSchema,
  AzureKeyVaultSyncSchema,
  AzureAppConfigurationSyncSchema,
  DatabricksSyncSchema,
  HumanitecSyncSchema,
  TerraformCloudSyncSchema,
  CamundaSyncSchema,
  VercelSyncSchema,
  WindmillSyncSchema,
  HCVaultSyncSchema,
  TeamCitySyncSchema,
  OCIVaultSyncSchema
]);

const SecretSyncOptionsSchema = z.discriminatedUnion("destination", [
  AwsParameterStoreSyncListItemSchema,
  AwsSecretsManagerSyncListItemSchema,
  GitHubSyncListItemSchema,
  GcpSyncListItemSchema,
  AzureKeyVaultSyncListItemSchema,
  AzureAppConfigurationSyncListItemSchema,
  DatabricksSyncListItemSchema,
  HumanitecSyncListItemSchema,
  TerraformCloudSyncListItemSchema,
  CamundaSyncListItemSchema,
  VercelSyncListItemSchema,
  WindmillSyncListItemSchema,
  HCVaultSyncListItemSchema,
  TeamCitySyncListItemSchema,
  OCIVaultSyncListItemSchema
]);

export const registerSecretSyncRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/options",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.SecretSyncs],
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
      hide: false,
      tags: [ApiDocsTags.SecretSyncs],
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
