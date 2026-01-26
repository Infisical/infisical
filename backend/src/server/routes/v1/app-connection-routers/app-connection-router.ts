import { z } from "zod";

import { ProjectType } from "@app/db/schemas";
import { ChefConnectionListItemSchema, SanitizedChefConnectionSchema } from "@app/ee/services/app-connections/chef";
import { OCIConnectionListItemSchema, SanitizedOCIConnectionSchema } from "@app/ee/services/app-connections/oci";
import {
  OracleDBConnectionListItemSchema,
  SanitizedOracleDBConnectionSchema
} from "@app/ee/services/app-connections/oracledb";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, AppConnections } from "@app/lib/api-docs";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import {
  OnePassConnectionListItemSchema,
  SanitizedOnePassConnectionSchema
} from "@app/services/app-connection/1password";
import { Auth0ConnectionListItemSchema, SanitizedAuth0ConnectionSchema } from "@app/services/app-connection/auth0";
import { AwsConnectionListItemSchema, SanitizedAwsConnectionSchema } from "@app/services/app-connection/aws";
import {
  AzureADCSConnectionListItemSchema,
  SanitizedAzureADCSConnectionSchema
} from "@app/services/app-connection/azure-adcs/azure-adcs-connection-schemas";
import {
  AzureAppConfigurationConnectionListItemSchema,
  SanitizedAzureAppConfigurationConnectionSchema
} from "@app/services/app-connection/azure-app-configuration";
import {
  AzureClientSecretsConnectionListItemSchema,
  SanitizedAzureClientSecretsConnectionSchema
} from "@app/services/app-connection/azure-client-secrets";
import {
  AzureDevOpsConnectionListItemSchema,
  SanitizedAzureDevOpsConnectionSchema
} from "@app/services/app-connection/azure-devops/azure-devops-schemas";
import {
  AzureKeyVaultConnectionListItemSchema,
  SanitizedAzureKeyVaultConnectionSchema
} from "@app/services/app-connection/azure-key-vault";
import {
  BitbucketConnectionListItemSchema,
  SanitizedBitbucketConnectionSchema
} from "@app/services/app-connection/bitbucket";
import {
  CamundaConnectionListItemSchema,
  SanitizedCamundaConnectionSchema
} from "@app/services/app-connection/camunda";
import {
  ChecklyConnectionListItemSchema,
  SanitizedChecklyConnectionSchema
} from "@app/services/app-connection/checkly";
import {
  CloudflareConnectionListItemSchema,
  SanitizedCloudflareConnectionSchema
} from "@app/services/app-connection/cloudflare/cloudflare-connection-schema";
import {
  DatabricksConnectionListItemSchema,
  SanitizedDatabricksConnectionSchema
} from "@app/services/app-connection/databricks";
import {
  DigitalOceanConnectionListItemSchema,
  SanitizedDigitalOceanConnectionSchema
} from "@app/services/app-connection/digital-ocean";
import {
  DNSMadeEasyConnectionListItemSchema,
  SanitizedDNSMadeEasyConnectionSchema
} from "@app/services/app-connection/dns-made-easy/dns-made-easy-connection-schema";
import { FlyioConnectionListItemSchema, SanitizedFlyioConnectionSchema } from "@app/services/app-connection/flyio";
import { GcpConnectionListItemSchema, SanitizedGcpConnectionSchema } from "@app/services/app-connection/gcp";
import { GitHubConnectionListItemSchema, SanitizedGitHubConnectionSchema } from "@app/services/app-connection/github";
import {
  GitHubRadarConnectionListItemSchema,
  SanitizedGitHubRadarConnectionSchema
} from "@app/services/app-connection/github-radar";
import { GitLabConnectionListItemSchema, SanitizedGitLabConnectionSchema } from "@app/services/app-connection/gitlab";
import {
  HCVaultConnectionListItemSchema,
  SanitizedHCVaultConnectionSchema
} from "@app/services/app-connection/hc-vault";
import { HerokuConnectionListItemSchema, SanitizedHerokuConnectionSchema } from "@app/services/app-connection/heroku";
import {
  HumanitecConnectionListItemSchema,
  SanitizedHumanitecConnectionSchema
} from "@app/services/app-connection/humanitec";
import {
  LaravelForgeConnectionListItemSchema,
  SanitizedLaravelForgeConnectionSchema
} from "@app/services/app-connection/laravel-forge";
import { LdapConnectionListItemSchema, SanitizedLdapConnectionSchema } from "@app/services/app-connection/ldap";
import {
  MongoDBConnectionListItemSchema,
  SanitizedMongoDBConnectionSchema
} from "@app/services/app-connection/mongodb";
import { MsSqlConnectionListItemSchema, SanitizedMsSqlConnectionSchema } from "@app/services/app-connection/mssql";
import { MySqlConnectionListItemSchema, SanitizedMySqlConnectionSchema } from "@app/services/app-connection/mysql";
import {
  NetlifyConnectionListItemSchema,
  SanitizedNetlifyConnectionSchema
} from "@app/services/app-connection/netlify";
import {
  NorthflankConnectionListItemSchema,
  SanitizedNorthflankConnectionSchema
} from "@app/services/app-connection/northflank";
import {
  OctopusDeployConnectionListItemSchema,
  SanitizedOctopusDeployConnectionSchema
} from "@app/services/app-connection/octopus-deploy";
import { OktaConnectionListItemSchema, SanitizedOktaConnectionSchema } from "@app/services/app-connection/okta";
import {
  PostgresConnectionListItemSchema,
  SanitizedPostgresConnectionSchema
} from "@app/services/app-connection/postgres";
import {
  RailwayConnectionListItemSchema,
  SanitizedRailwayConnectionSchema
} from "@app/services/app-connection/railway";
import { RedisConnectionListItemSchema, SanitizedRedisConnectionSchema } from "@app/services/app-connection/redis";
import {
  RenderConnectionListItemSchema,
  SanitizedRenderConnectionSchema
} from "@app/services/app-connection/render/render-connection-schema";
import { SanitizedSshConnectionSchema, SshConnectionListItemSchema } from "@app/services/app-connection/ssh";
import {
  SanitizedSupabaseConnectionSchema,
  SupabaseConnectionListItemSchema
} from "@app/services/app-connection/supabase";
import {
  SanitizedTeamCityConnectionSchema,
  TeamCityConnectionListItemSchema
} from "@app/services/app-connection/teamcity";
import {
  SanitizedTerraformCloudConnectionSchema,
  TerraformCloudConnectionListItemSchema
} from "@app/services/app-connection/terraform-cloud";
import { SanitizedVercelConnectionSchema, VercelConnectionListItemSchema } from "@app/services/app-connection/vercel";
import {
  SanitizedWindmillConnectionSchema,
  WindmillConnectionListItemSchema
} from "@app/services/app-connection/windmill";
import { SanitizedZabbixConnectionSchema, ZabbixConnectionListItemSchema } from "@app/services/app-connection/zabbix";
import { AuthMode } from "@app/services/auth/auth-type";

// can't use discriminated due to multiple schemas for certain apps
const SanitizedAppConnectionSchema = z.union([
  ...SanitizedAwsConnectionSchema.options,
  ...SanitizedGitHubConnectionSchema.options,
  ...SanitizedGitHubRadarConnectionSchema.options,
  ...SanitizedGcpConnectionSchema.options,
  ...SanitizedAzureKeyVaultConnectionSchema.options,
  ...SanitizedAzureAppConfigurationConnectionSchema.options,
  ...SanitizedAzureDevOpsConnectionSchema.options,
  ...SanitizedDatabricksConnectionSchema.options,
  ...SanitizedHumanitecConnectionSchema.options,
  ...SanitizedTerraformCloudConnectionSchema.options,
  ...SanitizedVercelConnectionSchema.options,
  ...SanitizedPostgresConnectionSchema.options,
  ...SanitizedMsSqlConnectionSchema.options,
  ...SanitizedMySqlConnectionSchema.options,
  ...SanitizedCamundaConnectionSchema.options,
  ...SanitizedAuth0ConnectionSchema.options,
  ...SanitizedHCVaultConnectionSchema.options,
  ...SanitizedAzureClientSecretsConnectionSchema.options,
  ...SanitizedWindmillConnectionSchema.options,
  ...SanitizedLdapConnectionSchema.options,
  ...SanitizedTeamCityConnectionSchema.options,
  ...SanitizedOCIConnectionSchema.options,
  ...SanitizedOracleDBConnectionSchema.options,
  ...SanitizedOnePassConnectionSchema.options,
  ...SanitizedHerokuConnectionSchema.options,
  ...SanitizedRenderConnectionSchema.options,
  ...SanitizedFlyioConnectionSchema.options,
  ...SanitizedGitLabConnectionSchema.options,
  ...SanitizedCloudflareConnectionSchema.options,
  ...SanitizedBitbucketConnectionSchema.options,
  ...SanitizedZabbixConnectionSchema.options,
  ...SanitizedRailwayConnectionSchema.options,
  ...SanitizedChecklyConnectionSchema.options,
  ...SanitizedSupabaseConnectionSchema.options,
  ...SanitizedDigitalOceanConnectionSchema.options,
  ...SanitizedNetlifyConnectionSchema.options,
  ...SanitizedNorthflankConnectionSchema.options,
  ...SanitizedOktaConnectionSchema.options,
  ...SanitizedAzureADCSConnectionSchema.options,
  ...SanitizedRedisConnectionSchema.options,
  ...SanitizedMongoDBConnectionSchema.options,
  ...SanitizedLaravelForgeConnectionSchema.options,
  ...SanitizedChefConnectionSchema.options,
  ...SanitizedDNSMadeEasyConnectionSchema.options,
  ...SanitizedOctopusDeployConnectionSchema.options,
  ...SanitizedSshConnectionSchema.options
]);

const AppConnectionOptionsSchema = z.discriminatedUnion("app", [
  AwsConnectionListItemSchema,
  GitHubConnectionListItemSchema,
  GitHubRadarConnectionListItemSchema,
  GcpConnectionListItemSchema,
  AzureKeyVaultConnectionListItemSchema,
  AzureAppConfigurationConnectionListItemSchema,
  AzureDevOpsConnectionListItemSchema,
  DatabricksConnectionListItemSchema,
  HumanitecConnectionListItemSchema,
  TerraformCloudConnectionListItemSchema,
  VercelConnectionListItemSchema,
  PostgresConnectionListItemSchema,
  MsSqlConnectionListItemSchema,
  MySqlConnectionListItemSchema,
  CamundaConnectionListItemSchema,
  Auth0ConnectionListItemSchema,
  HCVaultConnectionListItemSchema,
  AzureClientSecretsConnectionListItemSchema,
  WindmillConnectionListItemSchema,
  LdapConnectionListItemSchema,
  TeamCityConnectionListItemSchema,
  OCIConnectionListItemSchema,
  OracleDBConnectionListItemSchema,
  OnePassConnectionListItemSchema,
  HerokuConnectionListItemSchema,
  RenderConnectionListItemSchema,
  FlyioConnectionListItemSchema,
  GitLabConnectionListItemSchema,
  CloudflareConnectionListItemSchema,
  BitbucketConnectionListItemSchema,
  ZabbixConnectionListItemSchema,
  RailwayConnectionListItemSchema,
  ChecklyConnectionListItemSchema,
  SupabaseConnectionListItemSchema,
  DigitalOceanConnectionListItemSchema,
  NetlifyConnectionListItemSchema,
  NorthflankConnectionListItemSchema,
  OktaConnectionListItemSchema,
  AzureADCSConnectionListItemSchema,
  RedisConnectionListItemSchema,
  MongoDBConnectionListItemSchema,
  LaravelForgeConnectionListItemSchema,
  ChefConnectionListItemSchema,
  DNSMadeEasyConnectionListItemSchema,
  OctopusDeployConnectionListItemSchema,
  SshConnectionListItemSchema
]);

export const registerAppConnectionRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/options",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listAppConnectionOptions",
      tags: [ApiDocsTags.AppConnections],
      description: "List the available App Connection Options.",
      querystring: z.object({
        projectType: z.nativeEnum(ProjectType).optional()
      }),
      response: {
        200: z.object({
          appConnectionOptions: AppConnectionOptionsSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: (req) => {
      const appConnectionOptions = server.services.appConnection.listAppConnectionOptions(req.query.projectType);
      return { appConnectionOptions };
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
      operationId: "listAppConnections",
      tags: [ApiDocsTags.AppConnections],
      description: "List all the App Connections for the current organization or project.",
      querystring: z.object({
        projectId: z.string().optional().describe(AppConnections.LIST().projectId)
      }),
      response: {
        200: z.object({ appConnections: SanitizedAppConnectionSchema.array() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { projectId } = req.query;
      const appConnections = await server.services.appConnection.listAppConnections(
        req.permission,
        undefined,
        projectId
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
        event: {
          type: EventType.GET_APP_CONNECTIONS,
          metadata: {
            count: appConnections.length,
            connectionIds: appConnections.map((connection) => connection.id)
          }
        }
      });

      return { appConnections };
    }
  });
};
