import { registerOCIConnectionRouter } from "@app/ee/routes/v1/app-connection-routers/oci-connection-router";
import { registerOracleDBConnectionRouter } from "@app/ee/routes/v1/app-connection-routers/oracledb-connection-router";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { registerOnePassConnectionRouter } from "./1password-connection-router";
import { registerAuth0ConnectionRouter } from "./auth0-connection-router";
import { registerAwsConnectionRouter } from "./aws-connection-router";
import { registerAzureAppConfigurationConnectionRouter } from "./azure-app-configuration-connection-router";
import { registerAzureClientSecretsConnectionRouter } from "./azure-client-secrets-connection-router";
import { registerAzureDevOpsConnectionRouter } from "./azure-devops-connection-router";
import { registerAzureKeyVaultConnectionRouter } from "./azure-key-vault-connection-router";
import { registerBitbucketConnectionRouter } from "./bitbucket-connection-router";
import { registerCamundaConnectionRouter } from "./camunda-connection-router";
import { registerChecklyConnectionRouter } from "./checkly-connection-router";
import { registerCloudflareConnectionRouter } from "./cloudflare-connection-router";
import { registerDatabricksConnectionRouter } from "./databricks-connection-router";
import { registerDigitalOceanConnectionRouter } from "./digital-ocean-connection-router";
import { registerFlyioConnectionRouter } from "./flyio-connection-router";
import { registerGcpConnectionRouter } from "./gcp-connection-router";
import { registerGitHubConnectionRouter } from "./github-connection-router";
import { registerGitHubRadarConnectionRouter } from "./github-radar-connection-router";
import { registerGitLabConnectionRouter } from "./gitlab-connection-router";
import { registerHCVaultConnectionRouter } from "./hc-vault-connection-router";
import { registerHerokuConnectionRouter } from "./heroku-connection-router";
import { registerHumanitecConnectionRouter } from "./humanitec-connection-router";
import { registerLdapConnectionRouter } from "./ldap-connection-router";
import { registerMsSqlConnectionRouter } from "./mssql-connection-router";
import { registerMySqlConnectionRouter } from "./mysql-connection-router";
import { registerOktaConnectionRouter } from "./okta-connection-router";
import { registerPostgresConnectionRouter } from "./postgres-connection-router";
import { registerRailwayConnectionRouter } from "./railway-connection-router";
import { registerRenderConnectionRouter } from "./render-connection-router";
import { registerSupabaseConnectionRouter } from "./supabase-connection-router";
import { registerTeamCityConnectionRouter } from "./teamcity-connection-router";
import { registerTerraformCloudConnectionRouter } from "./terraform-cloud-router";
import { registerVercelConnectionRouter } from "./vercel-connection-router";
import { registerWindmillConnectionRouter } from "./windmill-connection-router";
import { registerZabbixConnectionRouter } from "./zabbix-connection-router";

export * from "./app-connection-router";

export const APP_CONNECTION_REGISTER_ROUTER_MAP: Record<AppConnection, (server: FastifyZodProvider) => Promise<void>> =
  {
    [AppConnection.AWS]: registerAwsConnectionRouter,
    [AppConnection.GitHub]: registerGitHubConnectionRouter,
    [AppConnection.GitHubRadar]: registerGitHubRadarConnectionRouter,
    [AppConnection.GCP]: registerGcpConnectionRouter,
    [AppConnection.AzureKeyVault]: registerAzureKeyVaultConnectionRouter,
    [AppConnection.AzureAppConfiguration]: registerAzureAppConfigurationConnectionRouter,
    [AppConnection.AzureClientSecrets]: registerAzureClientSecretsConnectionRouter,
    [AppConnection.AzureDevOps]: registerAzureDevOpsConnectionRouter,
    [AppConnection.Databricks]: registerDatabricksConnectionRouter,
    [AppConnection.Humanitec]: registerHumanitecConnectionRouter,
    [AppConnection.TerraformCloud]: registerTerraformCloudConnectionRouter,
    [AppConnection.Vercel]: registerVercelConnectionRouter,
    [AppConnection.Postgres]: registerPostgresConnectionRouter,
    [AppConnection.MsSql]: registerMsSqlConnectionRouter,
    [AppConnection.MySql]: registerMySqlConnectionRouter,
    [AppConnection.Camunda]: registerCamundaConnectionRouter,
    [AppConnection.Windmill]: registerWindmillConnectionRouter,
    [AppConnection.Auth0]: registerAuth0ConnectionRouter,
    [AppConnection.HCVault]: registerHCVaultConnectionRouter,
    [AppConnection.LDAP]: registerLdapConnectionRouter,
    [AppConnection.TeamCity]: registerTeamCityConnectionRouter,
    [AppConnection.OCI]: registerOCIConnectionRouter,
    [AppConnection.OracleDB]: registerOracleDBConnectionRouter,
    [AppConnection.OnePass]: registerOnePassConnectionRouter,
    [AppConnection.Heroku]: registerHerokuConnectionRouter,
    [AppConnection.Render]: registerRenderConnectionRouter,
    [AppConnection.Flyio]: registerFlyioConnectionRouter,
    [AppConnection.GitLab]: registerGitLabConnectionRouter,
    [AppConnection.Cloudflare]: registerCloudflareConnectionRouter,
    [AppConnection.Bitbucket]: registerBitbucketConnectionRouter,
    [AppConnection.Zabbix]: registerZabbixConnectionRouter,
    [AppConnection.Railway]: registerRailwayConnectionRouter,
    [AppConnection.Checkly]: registerChecklyConnectionRouter,
    [AppConnection.Supabase]: registerSupabaseConnectionRouter,
    [AppConnection.DigitalOcean]: registerDigitalOceanConnectionRouter,
    [AppConnection.Okta]: registerOktaConnectionRouter
  };
