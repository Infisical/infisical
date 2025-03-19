import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { registerAwsConnectionRouter } from "./aws-connection-router";
import { registerAzureAppConfigurationConnectionRouter } from "./azure-app-configuration-connection-router";
import { registerAzureKeyVaultConnectionRouter } from "./azure-key-vault-connection-router";
import { registerDatabricksConnectionRouter } from "./databricks-connection-router";
import { registerGcpConnectionRouter } from "./gcp-connection-router";
import { registerGitHubConnectionRouter } from "./github-connection-router";
import { registerHumanitecConnectionRouter } from "./humanitec-connection-router";

export * from "./app-connection-router";

export const APP_CONNECTION_REGISTER_ROUTER_MAP: Record<AppConnection, (server: FastifyZodProvider) => Promise<void>> =
  {
    [AppConnection.AWS]: registerAwsConnectionRouter,
    [AppConnection.GitHub]: registerGitHubConnectionRouter,
    [AppConnection.GCP]: registerGcpConnectionRouter,
    [AppConnection.AzureKeyVault]: registerAzureKeyVaultConnectionRouter,
    [AppConnection.AzureAppConfiguration]: registerAzureAppConfigurationConnectionRouter,
    [AppConnection.Databricks]: registerDatabricksConnectionRouter,
    [AppConnection.Humanitec]: registerHumanitecConnectionRouter
  };
