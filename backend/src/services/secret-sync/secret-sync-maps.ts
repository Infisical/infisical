import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync, SecretSyncPlanType } from "@app/services/secret-sync/secret-sync-enums";
import { DestinationDuplicateCheckFn } from "@app/services/secret-sync/secret-sync-types";

export const SECRET_SYNC_NAME_MAP: Record<SecretSync, string> = {
  [SecretSync.AWSParameterStore]: "AWS Parameter Store",
  [SecretSync.AWSSecretsManager]: "AWS Secrets Manager",
  [SecretSync.GitHub]: "GitHub",
  [SecretSync.GCPSecretManager]: "GCP Secret Manager",
  [SecretSync.AzureKeyVault]: "Azure Key Vault",
  [SecretSync.AzureAppConfiguration]: "Azure App Configuration",
  [SecretSync.AzureDevOps]: "Azure DevOps",
  [SecretSync.Databricks]: "Databricks",
  [SecretSync.Humanitec]: "Humanitec",
  [SecretSync.TerraformCloud]: "Terraform Cloud",
  [SecretSync.Camunda]: "Camunda",
  [SecretSync.Vercel]: "Vercel",
  [SecretSync.Windmill]: "Windmill",
  [SecretSync.HCVault]: "Hashicorp Vault",
  [SecretSync.TeamCity]: "TeamCity",
  [SecretSync.OCIVault]: "OCI Vault",
  [SecretSync.OnePass]: "1Password",
  [SecretSync.Heroku]: "Heroku",
  [SecretSync.Render]: "Render",
  [SecretSync.Flyio]: "Fly.io",
  [SecretSync.GitLab]: "GitLab",
  [SecretSync.CloudflarePages]: "Cloudflare Pages",
  [SecretSync.CloudflareWorkers]: "Cloudflare Workers",
  [SecretSync.Supabase]: "Supabase",
  [SecretSync.Zabbix]: "Zabbix",
  [SecretSync.Railway]: "Railway",
  [SecretSync.Checkly]: "Checkly",
  [SecretSync.DigitalOceanAppPlatform]: "Digital Ocean App Platform",
  [SecretSync.Netlify]: "Netlify",
  [SecretSync.Northflank]: "Northflank",
  [SecretSync.Bitbucket]: "Bitbucket",
  [SecretSync.LaravelForge]: "Laravel Forge",
  [SecretSync.Chef]: "Chef",
  [SecretSync.OctopusDeploy]: "Octopus Deploy",
  [SecretSync.TriggerDev]: "Trigger.dev"
};

export const SECRET_SYNC_CONNECTION_MAP: Record<SecretSync, AppConnection> = {
  [SecretSync.AWSParameterStore]: AppConnection.AWS,
  [SecretSync.AWSSecretsManager]: AppConnection.AWS,
  [SecretSync.GitHub]: AppConnection.GitHub,
  [SecretSync.GCPSecretManager]: AppConnection.GCP,
  [SecretSync.AzureKeyVault]: AppConnection.AzureKeyVault,
  [SecretSync.AzureAppConfiguration]: AppConnection.AzureAppConfiguration,
  [SecretSync.AzureDevOps]: AppConnection.AzureDevOps,
  [SecretSync.Databricks]: AppConnection.Databricks,
  [SecretSync.Humanitec]: AppConnection.Humanitec,
  [SecretSync.TerraformCloud]: AppConnection.TerraformCloud,
  [SecretSync.Camunda]: AppConnection.Camunda,
  [SecretSync.Vercel]: AppConnection.Vercel,
  [SecretSync.Windmill]: AppConnection.Windmill,
  [SecretSync.HCVault]: AppConnection.HCVault,
  [SecretSync.TeamCity]: AppConnection.TeamCity,
  [SecretSync.OCIVault]: AppConnection.OCI,
  [SecretSync.OnePass]: AppConnection.OnePass,
  [SecretSync.Heroku]: AppConnection.Heroku,
  [SecretSync.Render]: AppConnection.Render,
  [SecretSync.Flyio]: AppConnection.Flyio,
  [SecretSync.GitLab]: AppConnection.GitLab,
  [SecretSync.CloudflarePages]: AppConnection.Cloudflare,
  [SecretSync.CloudflareWorkers]: AppConnection.Cloudflare,
  [SecretSync.Supabase]: AppConnection.Supabase,
  [SecretSync.Zabbix]: AppConnection.Zabbix,
  [SecretSync.Railway]: AppConnection.Railway,
  [SecretSync.Checkly]: AppConnection.Checkly,
  [SecretSync.DigitalOceanAppPlatform]: AppConnection.DigitalOcean,
  [SecretSync.Netlify]: AppConnection.Netlify,
  [SecretSync.Northflank]: AppConnection.Northflank,
  [SecretSync.Bitbucket]: AppConnection.Bitbucket,
  [SecretSync.LaravelForge]: AppConnection.LaravelForge,
  [SecretSync.Chef]: AppConnection.Chef,
  [SecretSync.OctopusDeploy]: AppConnection.OctopusDeploy,
  [SecretSync.TriggerDev]: AppConnection.TriggerDev
};

export const SECRET_SYNC_PLAN_MAP: Record<SecretSync, SecretSyncPlanType> = {
  [SecretSync.AWSParameterStore]: SecretSyncPlanType.Regular,
  [SecretSync.AWSSecretsManager]: SecretSyncPlanType.Regular,
  [SecretSync.GitHub]: SecretSyncPlanType.Regular,
  [SecretSync.GCPSecretManager]: SecretSyncPlanType.Regular,
  [SecretSync.AzureKeyVault]: SecretSyncPlanType.Regular,
  [SecretSync.AzureAppConfiguration]: SecretSyncPlanType.Regular,
  [SecretSync.AzureDevOps]: SecretSyncPlanType.Regular,
  [SecretSync.Databricks]: SecretSyncPlanType.Regular,
  [SecretSync.Humanitec]: SecretSyncPlanType.Regular,
  [SecretSync.TerraformCloud]: SecretSyncPlanType.Regular,
  [SecretSync.Camunda]: SecretSyncPlanType.Regular,
  [SecretSync.Vercel]: SecretSyncPlanType.Regular,
  [SecretSync.Windmill]: SecretSyncPlanType.Regular,
  [SecretSync.HCVault]: SecretSyncPlanType.Regular,
  [SecretSync.TeamCity]: SecretSyncPlanType.Regular,
  [SecretSync.OCIVault]: SecretSyncPlanType.Enterprise,
  [SecretSync.OnePass]: SecretSyncPlanType.Regular,
  [SecretSync.Heroku]: SecretSyncPlanType.Regular,
  [SecretSync.Render]: SecretSyncPlanType.Regular,
  [SecretSync.Flyio]: SecretSyncPlanType.Regular,
  [SecretSync.GitLab]: SecretSyncPlanType.Regular,
  [SecretSync.CloudflarePages]: SecretSyncPlanType.Regular,
  [SecretSync.CloudflareWorkers]: SecretSyncPlanType.Regular,
  [SecretSync.Supabase]: SecretSyncPlanType.Regular,
  [SecretSync.Zabbix]: SecretSyncPlanType.Regular,
  [SecretSync.Railway]: SecretSyncPlanType.Regular,
  [SecretSync.Checkly]: SecretSyncPlanType.Regular,
  [SecretSync.DigitalOceanAppPlatform]: SecretSyncPlanType.Regular,
  [SecretSync.Netlify]: SecretSyncPlanType.Regular,
  [SecretSync.Northflank]: SecretSyncPlanType.Regular,
  [SecretSync.Bitbucket]: SecretSyncPlanType.Regular,
  [SecretSync.LaravelForge]: SecretSyncPlanType.Regular,
  [SecretSync.Chef]: SecretSyncPlanType.Enterprise,
  [SecretSync.OctopusDeploy]: SecretSyncPlanType.Regular,
  [SecretSync.TriggerDev]: SecretSyncPlanType.Regular
};

export const SECRET_SYNC_SKIP_FIELDS_MAP: Record<SecretSync, string[]> = {
  [SecretSync.AWSParameterStore]: [],
  [SecretSync.AWSSecretsManager]: ["mappingBehavior"],
  [SecretSync.GitHub]: [],
  [SecretSync.GCPSecretManager]: [],
  [SecretSync.AzureKeyVault]: [],
  [SecretSync.AzureAppConfiguration]: ["label"],
  [SecretSync.AzureDevOps]: ["devopsProjectName"],
  [SecretSync.Databricks]: [],
  [SecretSync.Humanitec]: [],
  [SecretSync.TerraformCloud]: ["variableSetName", "workspaceName"],
  [SecretSync.Camunda]: [],
  [SecretSync.Vercel]: ["appName"],
  [SecretSync.Windmill]: [],
  [SecretSync.HCVault]: [],
  [SecretSync.TeamCity]: [],
  [SecretSync.OCIVault]: [],
  [SecretSync.OnePass]: ["valueLabel"],
  [SecretSync.Heroku]: ["appName"],
  [SecretSync.Render]: [],
  [SecretSync.Flyio]: [],
  [SecretSync.GitLab]: [
    "projectName",
    "shouldProtectSecrets",
    "shouldMaskSecrets",
    "shouldHideSecrets",
    "targetEnvironment",
    "groupName",
    "groupId",
    "projectId"
  ],
  [SecretSync.CloudflarePages]: [],
  [SecretSync.CloudflareWorkers]: [],
  [SecretSync.Supabase]: ["projectName"],
  [SecretSync.Zabbix]: ["hostName", "macroType"],
  [SecretSync.Railway]: ["projectName", "environmentName", "serviceName"],
  [SecretSync.Checkly]: ["groupName", "accountName"],
  [SecretSync.DigitalOceanAppPlatform]: ["appName"],
  [SecretSync.Netlify]: ["accountName", "siteName"],
  [SecretSync.Northflank]: [],
  [SecretSync.Bitbucket]: [],
  [SecretSync.LaravelForge]: [],
  [SecretSync.Chef]: [],
  [SecretSync.OctopusDeploy]: [],
  [SecretSync.TriggerDev]: []
};

const defaultDuplicateCheck: DestinationDuplicateCheckFn = () => true;

export const DESTINATION_DUPLICATE_CHECK_MAP: Record<SecretSync, DestinationDuplicateCheckFn> = {
  [SecretSync.AWSParameterStore]: defaultDuplicateCheck,
  [SecretSync.AWSSecretsManager]: defaultDuplicateCheck,
  [SecretSync.GitHub]: defaultDuplicateCheck,
  [SecretSync.GCPSecretManager]: defaultDuplicateCheck,
  [SecretSync.AzureKeyVault]: defaultDuplicateCheck,
  [SecretSync.AzureAppConfiguration]: defaultDuplicateCheck,
  [SecretSync.AzureDevOps]: defaultDuplicateCheck,
  [SecretSync.Databricks]: defaultDuplicateCheck,
  [SecretSync.Humanitec]: defaultDuplicateCheck,
  [SecretSync.TerraformCloud]: defaultDuplicateCheck,
  [SecretSync.Camunda]: defaultDuplicateCheck,
  [SecretSync.Vercel]: defaultDuplicateCheck,
  [SecretSync.Windmill]: defaultDuplicateCheck,
  [SecretSync.HCVault]: defaultDuplicateCheck,
  [SecretSync.TeamCity]: defaultDuplicateCheck,
  [SecretSync.OCIVault]: defaultDuplicateCheck,
  [SecretSync.OnePass]: defaultDuplicateCheck,
  [SecretSync.Heroku]: defaultDuplicateCheck,
  [SecretSync.Render]: defaultDuplicateCheck,
  [SecretSync.Flyio]: defaultDuplicateCheck,
  [SecretSync.GitLab]: (existingConfig, newConfig) => {
    const existingTargetEnv = existingConfig.targetEnvironment as string | undefined;
    const newTargetEnv = newConfig.targetEnvironment as string | undefined;

    const wildcardValues = ["*", ""];

    if (
      (newConfig.scope as string) === "group"
        ? existingConfig.groupId !== newConfig.groupId
        : existingConfig.projectId !== newConfig.projectId
    )
      return false;

    // If either has wildcard, it conflicts with any targetEnvironment
    if (
      !existingTargetEnv ||
      !newTargetEnv ||
      wildcardValues.includes(existingTargetEnv) ||
      wildcardValues.includes(newTargetEnv)
    ) {
      return true;
    }

    return existingTargetEnv === newTargetEnv;
  },
  [SecretSync.CloudflarePages]: defaultDuplicateCheck,
  [SecretSync.CloudflareWorkers]: defaultDuplicateCheck,
  [SecretSync.Supabase]: defaultDuplicateCheck,
  [SecretSync.Zabbix]: defaultDuplicateCheck,
  [SecretSync.Railway]: defaultDuplicateCheck,
  [SecretSync.Checkly]: defaultDuplicateCheck,
  [SecretSync.DigitalOceanAppPlatform]: defaultDuplicateCheck,
  [SecretSync.Netlify]: defaultDuplicateCheck,
  [SecretSync.Northflank]: defaultDuplicateCheck,
  [SecretSync.Bitbucket]: defaultDuplicateCheck,
  [SecretSync.LaravelForge]: defaultDuplicateCheck,
  [SecretSync.Chef]: defaultDuplicateCheck,
  [SecretSync.OctopusDeploy]: defaultDuplicateCheck,
  [SecretSync.TriggerDev]: defaultDuplicateCheck
};
