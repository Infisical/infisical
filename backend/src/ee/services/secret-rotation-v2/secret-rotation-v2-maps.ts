import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const SECRET_ROTATION_NAME_MAP: Record<SecretRotation, string> = {
  [SecretRotation.PostgresCredentials]: "PostgreSQL Credentials",
  [SecretRotation.MsSqlCredentials]: "Microsoft SQL Server Credentials",
  [SecretRotation.MySqlCredentials]: "MySQL Credentials",
  [SecretRotation.OracleDBCredentials]: "OracleDB Credentials",
  [SecretRotation.Auth0ClientSecret]: "Auth0 Client Secret",
  [SecretRotation.AzureClientSecret]: "Azure Client Secret",
  [SecretRotation.AwsIamUserSecret]: "AWS IAM User Secret",
  [SecretRotation.LdapPassword]: "LDAP Password",
  [SecretRotation.OktaClientSecret]: "Okta Client Secret",
  [SecretRotation.RedisCredentials]: "Redis Credentials",
  [SecretRotation.MongoDBCredentials]: "MongoDB Credentials",
  [SecretRotation.DatabricksServicePrincipalSecret]: "Databricks Service Principal Secret",
  [SecretRotation.UnixLinuxLocalAccount]: "Unix/Linux Local Account",
  [SecretRotation.DbtServiceToken]: "DBT Service Token",
  [SecretRotation.WindowsLocalAccount]: "Windows Local Account",
  [SecretRotation.OpenRouterApiKey]: "OpenRouter API Key",
  [SecretRotation.LiteLLMApiKey]: "LiteLLM API Key",
  [SecretRotation.OpenAIServiceAccount]: "OpenAI Service Account",
  [SecretRotation.HpIloLocalAccount]: "HP iLO Local Account",
  [SecretRotation.SupabaseApiKey]: "Supabase API Key",
  [SecretRotation.SalesforceOauthCredentials]: "Salesforce OAuth Credentials",
  [SecretRotation.DatadogApplicationKeySecret]: "Datadog Application Key",
  [SecretRotation.DatadogApiKey]: "Datadog API Key",
  [SecretRotation.ConvexAccessKey]: "Convex Access Key",
  [SecretRotation.FireworksApiKey]: "Fireworks Secret",
  [SecretRotation.SnowflakeUserKeyPair]: "Snowflake User Key Pair",
  [SecretRotation.CloudflareApiToken]: "Cloudflare API Token",
  [SecretRotation.CloudflareR2AccessKey]: "Cloudflare R2 Access Key",
  [SecretRotation.StripeApiKey]: "Stripe API Key",
  [SecretRotation.GcpServiceAccountKey]: "GCP Service Account Key"
};

export const SECRET_ROTATION_CONNECTION_MAP: Record<SecretRotation, AppConnection> = {
  [SecretRotation.PostgresCredentials]: AppConnection.Postgres,
  [SecretRotation.MsSqlCredentials]: AppConnection.MsSql,
  [SecretRotation.MySqlCredentials]: AppConnection.MySql,
  [SecretRotation.OracleDBCredentials]: AppConnection.OracleDB,
  [SecretRotation.Auth0ClientSecret]: AppConnection.Auth0,
  [SecretRotation.AzureClientSecret]: AppConnection.AzureClientSecrets,
  [SecretRotation.AwsIamUserSecret]: AppConnection.AWS,
  [SecretRotation.LdapPassword]: AppConnection.LDAP,
  [SecretRotation.OktaClientSecret]: AppConnection.Okta,
  [SecretRotation.RedisCredentials]: AppConnection.Redis,
  [SecretRotation.MongoDBCredentials]: AppConnection.MongoDB,
  [SecretRotation.DatabricksServicePrincipalSecret]: AppConnection.Databricks,
  [SecretRotation.UnixLinuxLocalAccount]: AppConnection.SSH,
  [SecretRotation.DbtServiceToken]: AppConnection.Dbt,
  [SecretRotation.WindowsLocalAccount]: AppConnection.SMB,
  [SecretRotation.OpenRouterApiKey]: AppConnection.OpenRouter,
  [SecretRotation.LiteLLMApiKey]: AppConnection.LiteLLM,
  [SecretRotation.OpenAIServiceAccount]: AppConnection.OpenAI,
  [SecretRotation.HpIloLocalAccount]: AppConnection.SSH,
  [SecretRotation.SupabaseApiKey]: AppConnection.Supabase,
  [SecretRotation.SalesforceOauthCredentials]: AppConnection.Salesforce,
  [SecretRotation.DatadogApplicationKeySecret]: AppConnection.Datadog,
  [SecretRotation.DatadogApiKey]: AppConnection.Datadog,
  [SecretRotation.ConvexAccessKey]: AppConnection.Convex,
  [SecretRotation.FireworksApiKey]: AppConnection.Fireworks,
  [SecretRotation.SnowflakeUserKeyPair]: AppConnection.Snowflake,
  [SecretRotation.CloudflareApiToken]: AppConnection.Cloudflare,
  [SecretRotation.CloudflareR2AccessKey]: AppConnection.Cloudflare,
  [SecretRotation.StripeApiKey]: AppConnection.Stripe,
  [SecretRotation.GcpServiceAccountKey]: AppConnection.GCP
};

export const DEFAULT_SECRET_ROTATION_LOCK_TTL_MS = 60 * 1000;

// For rotations that wait on the provider after creating a credential, so a rotation still running can't
// have its lock expire and another rotation start on the same credentials.
export const SECRET_ROTATION_LOCK_TTL_MS: Partial<Record<SecretRotation, number>> = {
  [SecretRotation.GcpServiceAccountKey]: 5 * 60 * 1000
};
