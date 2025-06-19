import { z } from "zod";

import { OCIConnectionListItemSchema, SanitizedOCIConnectionSchema } from "@app/ee/services/app-connections/oci";
import {
  OracleDBConnectionListItemSchema,
  SanitizedOracleDBConnectionSchema
} from "@app/ee/services/app-connections/oracledb";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import {
  OnePassConnectionListItemSchema,
  SanitizedOnePassConnectionSchema
} from "@app/services/app-connection/1password";
import { Auth0ConnectionListItemSchema, SanitizedAuth0ConnectionSchema } from "@app/services/app-connection/auth0";
import { AwsConnectionListItemSchema, SanitizedAwsConnectionSchema } from "@app/services/app-connection/aws";
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
  CamundaConnectionListItemSchema,
  SanitizedCamundaConnectionSchema
} from "@app/services/app-connection/camunda";
import {
  DatabricksConnectionListItemSchema,
  SanitizedDatabricksConnectionSchema
} from "@app/services/app-connection/databricks";
import { FlyioConnectionListItemSchema, SanitizedFlyioConnectionSchema } from "@app/services/app-connection/flyio";
import { GcpConnectionListItemSchema, SanitizedGcpConnectionSchema } from "@app/services/app-connection/gcp";
import { GitHubConnectionListItemSchema, SanitizedGitHubConnectionSchema } from "@app/services/app-connection/github";
import {
  GitHubRadarConnectionListItemSchema,
  SanitizedGitHubRadarConnectionSchema
} from "@app/services/app-connection/github-radar";
import {
  HCVaultConnectionListItemSchema,
  SanitizedHCVaultConnectionSchema
} from "@app/services/app-connection/hc-vault";
import { HerokuConnectionListItemSchema, SanitizedHerokuConnectionSchema } from "@app/services/app-connection/heroku";
import {
  HumanitecConnectionListItemSchema,
  SanitizedHumanitecConnectionSchema
} from "@app/services/app-connection/humanitec";
import { LdapConnectionListItemSchema, SanitizedLdapConnectionSchema } from "@app/services/app-connection/ldap";
import { MsSqlConnectionListItemSchema, SanitizedMsSqlConnectionSchema } from "@app/services/app-connection/mssql";
import { MySqlConnectionListItemSchema, SanitizedMySqlConnectionSchema } from "@app/services/app-connection/mysql";
import {
  PostgresConnectionListItemSchema,
  SanitizedPostgresConnectionSchema
} from "@app/services/app-connection/postgres";
import {
  RenderConnectionListItemSchema,
  SanitizedRenderConnectionSchema
} from "@app/services/app-connection/render/render-connection-schema";
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
  ...SanitizedFlyioConnectionSchema.options
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
  FlyioConnectionListItemSchema
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
      tags: [ApiDocsTags.AppConnections],
      description: "List the available App Connection Options.",
      response: {
        200: z.object({
          appConnectionOptions: AppConnectionOptionsSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: () => {
      const appConnectionOptions = server.services.appConnection.listAppConnectionOptions();
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
      tags: [ApiDocsTags.AppConnections],
      description: "List all the App Connections for the current organization.",
      response: {
        200: z.object({ appConnections: SanitizedAppConnectionSchema.array() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const appConnections = await server.services.appConnection.listAppConnectionsByOrg(req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
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
