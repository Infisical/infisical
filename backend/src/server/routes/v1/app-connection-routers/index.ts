import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { registerAuth0ConnectionRouter } from "./auth0-connection-router";
import { registerAwsConnectionRouter } from "./aws-connection-router";
import { registerAzureAppConfigurationConnectionRouter } from "./azure-app-configuration-connection-router";
import { registerAzureClientSecretsConnectionRouter } from "./azure-client-secrets-connection-router";
import { registerAzureKeyVaultConnectionRouter } from "./azure-key-vault-connection-router";
import { registerCamundaConnectionRouter } from "./camunda-connection-router";
import { registerDatabricksConnectionRouter } from "./databricks-connection-router";
import { registerGcpConnectionRouter } from "./gcp-connection-router";
import { registerGitHubConnectionRouter } from "./github-connection-router";
import { registerHCVaultConnectionRouter } from "./hc-vault-connection-router";
import { registerHumanitecConnectionRouter } from "./humanitec-connection-router";
import { registerLdapConnectionRouter } from "./ldap-connection-router";
import { registerMsSqlConnectionRouter } from "./mssql-connection-router";
import { registerOCIConnectionRouter } from "./oci-connection-router";
import { registerPostgresConnectionRouter } from "./postgres-connection-router";
import { registerTeamCityConnectionRouter } from "./teamcity-connection-router";
import { registerTerraformCloudConnectionRouter } from "./terraform-cloud-router";
import { registerVercelConnectionRouter } from "./vercel-connection-router";
import { registerWindmillConnectionRouter } from "./windmill-connection-router";

export * from "./app-connection-router";

export const APP_CONNECTION_REGISTER_ROUTER_MAP: Record<AppConnection, (server: FastifyZodProvider) => Promise<void>> =
  {
    [AppConnection.AWS]: registerAwsConnectionRouter,
    [AppConnection.GitHub]: registerGitHubConnectionRouter,
    [AppConnection.GCP]: registerGcpConnectionRouter,
    [AppConnection.AzureKeyVault]: registerAzureKeyVaultConnectionRouter,
    [AppConnection.AzureAppConfiguration]: registerAzureAppConfigurationConnectionRouter,
    [AppConnection.AzureClientSecrets]: registerAzureClientSecretsConnectionRouter,
    [AppConnection.Databricks]: registerDatabricksConnectionRouter,
    [AppConnection.Humanitec]: registerHumanitecConnectionRouter,
    [AppConnection.TerraformCloud]: registerTerraformCloudConnectionRouter,
    [AppConnection.Vercel]: registerVercelConnectionRouter,
    [AppConnection.Postgres]: registerPostgresConnectionRouter,
    [AppConnection.MsSql]: registerMsSqlConnectionRouter,
    [AppConnection.Camunda]: registerCamundaConnectionRouter,
    [AppConnection.Windmill]: registerWindmillConnectionRouter,
    [AppConnection.Auth0]: registerAuth0ConnectionRouter,
    [AppConnection.HCVault]: registerHCVaultConnectionRouter,
    [AppConnection.LDAP]: registerLdapConnectionRouter,
    [AppConnection.TeamCity]: registerTeamCityConnectionRouter,
    [AppConnection.OCI]: registerOCIConnectionRouter
  };
