import { registerChefConnectionRouter } from "@app/ee/routes/v1/app-connection-routers/chef-connection-router";
import { registerOCIConnectionRouter } from "@app/ee/routes/v1/app-connection-routers/oci-connection-router";
import { registerOracleDBConnectionRouter } from "@app/ee/routes/v1/app-connection-routers/oracledb-connection-router";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { registerOnePassConnectionRouter } from "./1password-connection-router";
import { registerAuth0ConnectionRouter } from "./auth0-connection-router";
import { registerAwsConnectionRouter } from "./aws-connection-router";
import { registerAzureADCSConnectionRouter } from "./azure-adcs-connection-router";
import { registerAzureAppConfigurationConnectionRouter } from "./azure-app-configuration-connection-router";
import { registerAzureClientSecretsConnectionRouter } from "./azure-client-secrets-connection-router";
import { registerAzureDevOpsConnectionRouter } from "./azure-devops-connection-router";
import { registerAzureKeyVaultConnectionRouter } from "./azure-key-vault-connection-router";
import { registerBitbucketConnectionRouter } from "./bitbucket-connection-router";
import { registerCamundaConnectionRouter } from "./camunda-connection-router";
import { registerChecklyConnectionRouter } from "./checkly-connection-router";
import { registerCircleCIConnectionRouter } from "./circleci-connection-router";
import { registerCloudflareConnectionRouter } from "./cloudflare-connection-router";
import { registerDatabricksConnectionRouter } from "./databricks-connection-router";
import { registerDigitalOceanConnectionRouter } from "./digital-ocean-connection-router";
import { registerDNSMadeEasyConnectionRouter } from "./dns-made-easy-connection-router";
import { registerFlyioConnectionRouter } from "./flyio-connection-router";
import { registerGcpConnectionRouter } from "./gcp-connection-router";
import { registerGitHubConnectionRouter } from "./github-connection-router";
import { registerGitHubRadarConnectionRouter } from "./github-radar-connection-router";
import { registerGitLabConnectionRouter } from "./gitlab-connection-router";
import { registerHCVaultConnectionRouter } from "./hc-vault-connection-router";
import { registerHerokuConnectionRouter } from "./heroku-connection-router";
import { registerHumanitecConnectionRouter } from "./humanitec-connection-router";
import { registerLaravelForgeConnectionRouter } from "./laravel-forge-connection-router";
import { registerLdapConnectionRouter } from "./ldap-connection-router";
import { registerMongoDBConnectionRouter } from "./mongodb-connection-router";
import { registerMsSqlConnectionRouter } from "./mssql-connection-router";
import { registerMySqlConnectionRouter } from "./mysql-connection-router";
import { registerNetlifyConnectionRouter } from "./netlify-connection-router";
import { registerNorthflankConnectionRouter } from "./northflank-connection-router";
import { registerOctopusDeployConnectionRouter } from "./octopus-deploy-connection-router";
import { registerOktaConnectionRouter } from "./okta-connection-router";
import { registerOpenRouterConnectionRouter } from "./open-router-connection-router";
import { registerPostgresConnectionRouter } from "./postgres-connection-router";
import { registerRailwayConnectionRouter } from "./railway-connection-router";
import { registerRedisConnectionRouter } from "./redis-connection-router";
import { registerRenderConnectionRouter } from "./render-connection-router";
import { registerSshConnectionRouter } from "./ssh-connection-router";
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
    [AppConnection.AzureADCS]: registerAzureADCSConnectionRouter,
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
    [AppConnection.LaravelForge]: registerLaravelForgeConnectionRouter,
    [AppConnection.Flyio]: registerFlyioConnectionRouter,
    [AppConnection.GitLab]: registerGitLabConnectionRouter,
    [AppConnection.Cloudflare]: registerCloudflareConnectionRouter,
    [AppConnection.DNSMadeEasy]: registerDNSMadeEasyConnectionRouter,
    [AppConnection.Bitbucket]: registerBitbucketConnectionRouter,
    [AppConnection.Zabbix]: registerZabbixConnectionRouter,
    [AppConnection.Railway]: registerRailwayConnectionRouter,
    [AppConnection.Checkly]: registerChecklyConnectionRouter,
    [AppConnection.Supabase]: registerSupabaseConnectionRouter,
    [AppConnection.DigitalOcean]: registerDigitalOceanConnectionRouter,
    [AppConnection.Netlify]: registerNetlifyConnectionRouter,
    [AppConnection.Northflank]: registerNorthflankConnectionRouter,
    [AppConnection.Okta]: registerOktaConnectionRouter,
    [AppConnection.Redis]: registerRedisConnectionRouter,
    [AppConnection.MongoDB]: registerMongoDBConnectionRouter,
    [AppConnection.Chef]: registerChefConnectionRouter,
    [AppConnection.OctopusDeploy]: registerOctopusDeployConnectionRouter,
    [AppConnection.SSH]: registerSshConnectionRouter,
    [AppConnection.OpenRouter]: registerOpenRouterConnectionRouter,
    [AppConnection.CircleCI]: registerCircleCIConnectionRouter
  };
