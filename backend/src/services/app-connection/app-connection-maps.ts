import { AppConnection } from "./app-connection-enums";

export const APP_CONNECTION_NAME_MAP: Record<AppConnection, string> = {
  [AppConnection.AWS]: "AWS",
  [AppConnection.GitHub]: "GitHub",
  [AppConnection.GCP]: "GCP",
  [AppConnection.AzureKeyVault]: "Azure Key Vault",
  [AppConnection.AzureAppConfiguration]: "Azure App Configuration",
  [AppConnection.Databricks]: "Databricks",
  [AppConnection.Humanitec]: "Humanitec",
  [AppConnection.TerraformCloud]: "Terraform Cloud",
  [AppConnection.Vercel]: "Vercel",
  [AppConnection.Postgres]: "PostgreSQL",
  [AppConnection.MsSql]: "Microsoft SQL Server",
  [AppConnection.Camunda]: "Camunda",
  [AppConnection.Auth0]: "Auth0"
};
