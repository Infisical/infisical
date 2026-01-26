import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ChefSyncListItemSchema, ChefSyncSchema } from "@app/ee/services/secret-sync/chef";
import { OCIVaultSyncListItemSchema, OCIVaultSyncSchema } from "@app/ee/services/secret-sync/oci-vault";
import { ApiDocsTags, SecretSyncs } from "@app/lib/api-docs";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { OnePassSyncListItemSchema, OnePassSyncSchema } from "@app/services/secret-sync/1password";
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
import { AzureDevOpsSyncListItemSchema, AzureDevOpsSyncSchema } from "@app/services/secret-sync/azure-devops";
import { AzureKeyVaultSyncListItemSchema, AzureKeyVaultSyncSchema } from "@app/services/secret-sync/azure-key-vault";
import { BitbucketSyncListItemSchema, BitbucketSyncSchema } from "@app/services/secret-sync/bitbucket";
import { CamundaSyncListItemSchema, CamundaSyncSchema } from "@app/services/secret-sync/camunda";
import { ChecklySyncListItemSchema, ChecklySyncSchema } from "@app/services/secret-sync/checkly/checkly-sync-schemas";
import {
  CloudflarePagesSyncListItemSchema,
  CloudflarePagesSyncSchema
} from "@app/services/secret-sync/cloudflare-pages/cloudflare-pages-schema";
import {
  CloudflareWorkersSyncListItemSchema,
  CloudflareWorkersSyncSchema
} from "@app/services/secret-sync/cloudflare-workers/cloudflare-workers-schemas";
import { DatabricksSyncListItemSchema, DatabricksSyncSchema } from "@app/services/secret-sync/databricks";
import {
  DigitalOceanAppPlatformSyncListItemSchema,
  DigitalOceanAppPlatformSyncSchema
} from "@app/services/secret-sync/digital-ocean-app-platform";
import { FlyioSyncListItemSchema, FlyioSyncSchema } from "@app/services/secret-sync/flyio";
import { GcpSyncListItemSchema, GcpSyncSchema } from "@app/services/secret-sync/gcp";
import { GitHubSyncListItemSchema, GitHubSyncSchema } from "@app/services/secret-sync/github";
import { GitLabSyncListItemSchema, GitLabSyncSchema } from "@app/services/secret-sync/gitlab";
import { HCVaultSyncListItemSchema, HCVaultSyncSchema } from "@app/services/secret-sync/hc-vault";
import { HerokuSyncListItemSchema, HerokuSyncSchema } from "@app/services/secret-sync/heroku";
import { HumanitecSyncListItemSchema, HumanitecSyncSchema } from "@app/services/secret-sync/humanitec";
import { LaravelForgeSyncListItemSchema, LaravelForgeSyncSchema } from "@app/services/secret-sync/laravel-forge";
import { NetlifySyncListItemSchema, NetlifySyncSchema } from "@app/services/secret-sync/netlify";
import { NorthflankSyncListItemSchema, NorthflankSyncSchema } from "@app/services/secret-sync/northflank";
import { OctopusDeploySyncListItemSchema, OctopusDeploySyncSchema } from "@app/services/secret-sync/octopus-deploy";
import { RailwaySyncListItemSchema, RailwaySyncSchema } from "@app/services/secret-sync/railway/railway-sync-schemas";
import { RenderSyncListItemSchema, RenderSyncSchema } from "@app/services/secret-sync/render/render-sync-schemas";
import { SupabaseSyncListItemSchema, SupabaseSyncSchema } from "@app/services/secret-sync/supabase";
import { TeamCitySyncListItemSchema, TeamCitySyncSchema } from "@app/services/secret-sync/teamcity";
import { TerraformCloudSyncListItemSchema, TerraformCloudSyncSchema } from "@app/services/secret-sync/terraform-cloud";
import { VercelSyncListItemSchema, VercelSyncSchema } from "@app/services/secret-sync/vercel";
import { WindmillSyncListItemSchema, WindmillSyncSchema } from "@app/services/secret-sync/windmill";
import { ZabbixSyncListItemSchema, ZabbixSyncSchema } from "@app/services/secret-sync/zabbix";

const SecretSyncSchema = z.discriminatedUnion("destination", [
  AwsParameterStoreSyncSchema,
  AwsSecretsManagerSyncSchema,
  GitHubSyncSchema,
  GcpSyncSchema,
  AzureKeyVaultSyncSchema,
  AzureAppConfigurationSyncSchema,
  AzureDevOpsSyncSchema,
  DatabricksSyncSchema,
  HumanitecSyncSchema,
  TerraformCloudSyncSchema,
  CamundaSyncSchema,
  VercelSyncSchema,
  WindmillSyncSchema,
  HCVaultSyncSchema,
  TeamCitySyncSchema,
  OCIVaultSyncSchema,
  OnePassSyncSchema,
  HerokuSyncSchema,
  RenderSyncSchema,
  FlyioSyncSchema,
  GitLabSyncSchema,
  CloudflarePagesSyncSchema,
  CloudflareWorkersSyncSchema,
  SupabaseSyncSchema,
  ZabbixSyncSchema,
  RailwaySyncSchema,
  ChecklySyncSchema,
  DigitalOceanAppPlatformSyncSchema,
  NetlifySyncSchema,
  NorthflankSyncSchema,
  BitbucketSyncSchema,
  LaravelForgeSyncSchema,
  ChefSyncSchema,
  OctopusDeploySyncSchema
]);

const SecretSyncOptionsSchema = z.discriminatedUnion("destination", [
  AwsParameterStoreSyncListItemSchema,
  AwsSecretsManagerSyncListItemSchema,
  GitHubSyncListItemSchema,
  GcpSyncListItemSchema,
  AzureKeyVaultSyncListItemSchema,
  AzureAppConfigurationSyncListItemSchema,
  AzureDevOpsSyncListItemSchema,
  DatabricksSyncListItemSchema,
  HumanitecSyncListItemSchema,
  TerraformCloudSyncListItemSchema,
  CamundaSyncListItemSchema,
  VercelSyncListItemSchema,
  WindmillSyncListItemSchema,
  HCVaultSyncListItemSchema,
  TeamCitySyncListItemSchema,
  OCIVaultSyncListItemSchema,
  OnePassSyncListItemSchema,
  HerokuSyncListItemSchema,
  RenderSyncListItemSchema,
  FlyioSyncListItemSchema,
  GitLabSyncListItemSchema,
  CloudflarePagesSyncListItemSchema,
  CloudflareWorkersSyncListItemSchema,
  DigitalOceanAppPlatformSyncListItemSchema,
  ZabbixSyncListItemSchema,
  RailwaySyncListItemSchema,
  ChecklySyncListItemSchema,
  SupabaseSyncListItemSchema,
  NetlifySyncListItemSchema,
  NorthflankSyncListItemSchema,
  BitbucketSyncListItemSchema,
  LaravelForgeSyncListItemSchema,
  ChefSyncListItemSchema,
  OctopusDeploySyncListItemSchema
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
      operationId: "listSecretSyncOptions",
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
      operationId: "listSecretSyncs",
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
