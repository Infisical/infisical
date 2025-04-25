import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

export const SECRET_SYNC_NAME_MAP: Record<SecretSync, string> = {
  [SecretSync.AWSParameterStore]: "AWS Parameter Store",
  [SecretSync.AWSSecretsManager]: "AWS Secrets Manager",
  [SecretSync.GitHub]: "GitHub",
  [SecretSync.GCPSecretManager]: "GCP Secret Manager",
  [SecretSync.AzureKeyVault]: "Azure Key Vault",
  [SecretSync.AzureAppConfiguration]: "Azure App Configuration",
  [SecretSync.Databricks]: "Databricks",
  [SecretSync.Humanitec]: "Humanitec",
  [SecretSync.TerraformCloud]: "Terraform Cloud",
  [SecretSync.Camunda]: "Camunda",
  [SecretSync.Vercel]: "Vercel",
  [SecretSync.Windmill]: "Windmill",
  [SecretSync.HCVault]: "Hashicorp Vault",
  [SecretSync.TeamCity]: "TeamCity"
};

export const SECRET_SYNC_CONNECTION_MAP: Record<SecretSync, AppConnection> = {
  [SecretSync.AWSParameterStore]: AppConnection.AWS,
  [SecretSync.AWSSecretsManager]: AppConnection.AWS,
  [SecretSync.GitHub]: AppConnection.GitHub,
  [SecretSync.GCPSecretManager]: AppConnection.GCP,
  [SecretSync.AzureKeyVault]: AppConnection.AzureKeyVault,
  [SecretSync.AzureAppConfiguration]: AppConnection.AzureAppConfiguration,
  [SecretSync.Databricks]: AppConnection.Databricks,
  [SecretSync.Humanitec]: AppConnection.Humanitec,
  [SecretSync.TerraformCloud]: AppConnection.TerraformCloud,
  [SecretSync.Camunda]: AppConnection.Camunda,
  [SecretSync.Vercel]: AppConnection.Vercel,
  [SecretSync.Windmill]: AppConnection.Windmill,
  [SecretSync.HCVault]: AppConnection.HCVault,
  [SecretSync.TeamCity]: AppConnection.TeamCity
};
