import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  SecretSync,
  SecretSyncImportBehavior,
  SecretSyncInitialSyncBehavior
} from "@app/hooks/api/secretSyncs";
import { GcpSyncScope } from "@app/hooks/api/secretSyncs/types/gcp-sync";
import { HumanitecSyncScope } from "@app/hooks/api/secretSyncs/types/humanitec-sync";
import { RenderSyncScope } from "@app/hooks/api/secretSyncs/types/render-sync";

export const SECRET_SYNC_MAP: Record<
  SecretSync,
  {
    name: string;
    image: string;
    category: string;
    description: string;
    aliases?: string[];
  }
> = {
  [SecretSync.AWSParameterStore]: {
    name: "AWS Parameter Store",
    image: "Amazon Web Services.png",
    category: "AWS",
    description: "Hierarchical parameter store on AWS Systems Manager."
  },
  [SecretSync.AWSSecretsManager]: {
    name: "AWS Secrets Manager",
    image: "Amazon Web Services.png",
    category: "AWS",
    description: "Managed secret rotation and audit on AWS."
  },
  [SecretSync.GitHub]: {
    name: "GitHub",
    image: "GitHub.png",
    category: "CI/CD",
    description: "Repository or organization-level secrets."
  },
  [SecretSync.GCPSecretManager]: {
    name: "GCP Secret Manager",
    image: "Google Cloud Platform.png",
    category: "GOOGLE CLOUD",
    description: "Versioned secret storage on Google Cloud."
  },
  [SecretSync.AzureKeyVault]: {
    name: "Azure Key Vault",
    image: "Microsoft Azure.png",
    category: "AZURE",
    description: "Cloud-managed keys, secrets, and certificates."
  },
  [SecretSync.AzureAppConfiguration]: {
    name: "Azure App Configuration",
    image: "Microsoft Azure.png",
    category: "AZURE",
    description: "Centralized app settings on Microsoft Azure."
  },
  [SecretSync.AzureDevOps]: {
    name: "Azure DevOps",
    image: "Microsoft Azure.png",
    category: "AZURE",
    description: "Pipeline variables for Azure DevOps projects."
  },
  [SecretSync.Databricks]: {
    name: "Databricks",
    image: "Databricks.png",
    category: "DATA",
    description: "Workspace secret scopes for jobs and notebooks."
  },
  [SecretSync.Humanitec]: {
    name: "Humanitec",
    image: "Humanitec.png",
    category: "PLATFORM",
    description: "Application or environment-level shared values."
  },
  [SecretSync.TerraformCloud]: {
    name: "Terraform Cloud",
    image: "Terraform Cloud.png",
    category: "INFRASTRUCTURE",
    description: "Variables for Terraform Cloud workspaces."
  },
  [SecretSync.Camunda]: {
    name: "Camunda",
    image: "Camunda.png",
    category: "PLATFORM",
    description: "Cluster secrets for Camunda Platform 8."
  },
  [SecretSync.Vercel]: {
    name: "Vercel",
    image: "Vercel.png",
    category: "HOSTING",
    description: "Push environment variables to Vercel projects."
  },
  [SecretSync.Windmill]: {
    name: "Windmill",
    image: "Windmill.png",
    category: "PLATFORM",
    description: "Workspace variables for Windmill scripts and flows."
  },
  [SecretSync.HCVault]: {
    name: "Hashicorp Vault",
    image: "Vault.png",
    category: "SELF-HOSTED",
    description: "KV v1 or v2 engine on a Vault instance you manage."
  },
  [SecretSync.TeamCity]: {
    name: "TeamCity",
    image: "TeamCity.png",
    category: "CI/CD",
    description: "Project parameters in JetBrains TeamCity."
  },
  [SecretSync.OCIVault]: {
    name: "OCI Vault",
    image: "Oracle.png",
    category: "ORACLE",
    description: "Secret vault on Oracle Cloud Infrastructure."
  },
  [SecretSync.OnePass]: {
    name: "1Password",
    image: "1Password.png",
    category: "PASSWORD MANAGER",
    description: "Items in a 1Password vault."
  },
  [SecretSync.Heroku]: {
    name: "Heroku",
    image: "Heroku.png",
    category: "HOSTING",
    description: "Config vars for Heroku applications."
  },
  [SecretSync.Render]: {
    name: "Render",
    image: "Render.png",
    category: "HOSTING",
    description: "Environment variables for Render services."
  },
  [SecretSync.Flyio]: {
    name: "Fly.io",
    image: "Flyio.svg",
    category: "HOSTING",
    description: "Secrets for Fly.io apps."
  },
  [SecretSync.GitLab]: {
    name: "GitLab",
    image: "GitLab.png",
    category: "CI/CD",
    description: "Project or group-level CI/CD variables."
  },
  [SecretSync.CloudflarePages]: {
    name: "Cloudflare Pages",
    image: "Cloudflare.png",
    category: "HOSTING",
    description: "Environment variables for Cloudflare Pages."
  },
  [SecretSync.CloudflareWorkers]: {
    name: "Cloudflare Workers",
    image: "Cloudflare.png",
    category: "HOSTING",
    description: "Secrets bound to Cloudflare Workers."
  },
  [SecretSync.Zabbix]: {
    name: "Zabbix",
    image: "Zabbix.png",
    category: "MONITORING",
    description: "Macros for Zabbix monitoring templates."
  },
  [SecretSync.Railway]: {
    name: "Railway",
    image: "Railway.png",
    category: "HOSTING",
    description: "Service variables on Railway."
  },
  [SecretSync.Checkly]: {
    name: "Checkly",
    image: "Checkly.png",
    category: "MONITORING",
    description: "Environment variables for Checkly monitors."
  },
  [SecretSync.Supabase]: {
    name: "Supabase",
    image: "Supabase.png",
    category: "DATA",
    description: "Project secrets for Supabase."
  },
  [SecretSync.DigitalOceanAppPlatform]: {
    name: "Digital Ocean App Platform",
    image: "Digital Ocean.png",
    category: "HOSTING",
    description: "App-level environment variables on DigitalOcean."
  },
  [SecretSync.Netlify]: {
    name: "Netlify",
    image: "Netlify.png",
    category: "HOSTING",
    description: "Site-level environment variables."
  },
  [SecretSync.Bitbucket]: {
    name: "Bitbucket",
    image: "Bitbucket.png",
    category: "CI/CD",
    description: "Repository and deployment variables on Bitbucket."
  },
  [SecretSync.Northflank]: {
    name: "Northflank",
    image: "Northflank.png",
    category: "HOSTING",
    description: "Secret groups for Northflank projects."
  },
  [SecretSync.LaravelForge]: {
    name: "Laravel Forge",
    image: "Laravel Forge.png",
    category: "HOSTING",
    description: "Environment file values on Laravel Forge."
  },
  [SecretSync.Chef]: {
    name: "Chef",
    image: "Chef.png",
    category: "INFRASTRUCTURE",
    description: "Data bags for Chef Infra."
  },
  [SecretSync.OctopusDeploy]: {
    name: "Octopus Deploy",
    image: "Octopus Deploy.png",
    category: "CI/CD",
    description: "Project variables in Octopus Deploy."
  },
  [SecretSync.CircleCI]: {
    name: "CircleCI",
    image: "CircleCI.png",
    category: "CI/CD",
    description: "Project or context environment variables."
  },
  [SecretSync.AzureEntraIdScim]: {
    name: "Azure Entra ID SCIM",
    image: "Microsoft Azure.png",
    category: "AZURE",
    description: "SCIM provisioning tokens for Azure Entra ID Enterprise Applications."
  },
  [SecretSync.ExternalInfisical]: {
    name: "Infisical",
    image: "Infisical.png",
    category: "SECRETS",
    description: "Secrets in another Infisical instance."
  },
  [SecretSync.OVH]: {
    name: "OVH Cloud",
    image: "OVH.png",
    category: "CLOUD",
    description: "Secret vault on OVHcloud."
  },
  [SecretSync.Devin]: {
    name: "Devin",
    image: "Devin.png",
    category: "AI",
    description: "Organization secrets for Devin agents."
  },
  [SecretSync.Ona]: {
    name: "Ona",
    image: "Ona.png",
    category: "AI",
    description: "Project-level environment variables on Ona.",
    aliases: ["gitpod"]
  },
  [SecretSync.TravisCI]: {
    name: "Travis CI",
    image: "Travis CI.png",
    category: "CI/CD",
    description: "Repository environment variables on Travis CI."
  },
  [SecretSync.Snowflake]: {
    name: "Snowflake",
    image: "Snowflake.png",
    category: "DATA",
    description: "Secret objects in a Snowflake account."
  },
  [SecretSync.TriggerDev]: {
    name: "Trigger.dev",
    image: "TriggerDev.png",
    category: "HOSTING",
    description: "Environment variables for Trigger.dev projects."
  },
  [SecretSync.HasuraCloud]: {
    name: "Hasura Cloud",
    image: "Hasura.svg",
    category: "PLATFORM",
    description: "Environment variables for Hasura Cloud tenants."
  }
};

export const POPULAR_SECRET_SYNCS: SecretSync[] = [
  SecretSync.AWSParameterStore,
  SecretSync.GCPSecretManager,
  SecretSync.Vercel,
  SecretSync.GitHub
];

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
  [SecretSync.CircleCI]: AppConnection.CircleCI,
  [SecretSync.AzureEntraIdScim]: AppConnection.AzureEntraId,
  [SecretSync.ExternalInfisical]: AppConnection.ExternalInfisical,
  [SecretSync.OVH]: AppConnection.OVH,
  [SecretSync.Devin]: AppConnection.Devin,
  [SecretSync.Ona]: AppConnection.Ona,
  [SecretSync.TravisCI]: AppConnection.TravisCI,
  [SecretSync.Snowflake]: AppConnection.Snowflake,
  [SecretSync.TriggerDev]: AppConnection.TriggerDev,
  [SecretSync.HasuraCloud]: AppConnection.HasuraCloud
};

export const SECRET_SYNC_INITIAL_SYNC_BEHAVIOR_MAP: Record<
  SecretSyncInitialSyncBehavior,
  (destinationName: string) => { name: string; description: string }
> = {
  [SecretSyncInitialSyncBehavior.OverwriteDestination]: (destinationName: string) => ({
    name: "Overwrite Destination Secrets",
    description: `Infisical will overwrite any secrets located in the ${destinationName} destination, removing any secrets that are not present within Infiscal. `
  }),
  [SecretSyncInitialSyncBehavior.ImportPrioritizeSource]: (destinationName: string) => ({
    name:
      destinationName === "Infisical"
        ? "Import Destination Secrets - Prioritize Source (This Instance) Values"
        : "Import Destination Secrets - Prioritize Infisical Values",
    description: `Infisical will import any secrets present in the ${destinationName} destination prior to syncing, prioritizing values from Infisical over ${destinationName} when keys conflict.`
  }),
  [SecretSyncInitialSyncBehavior.ImportPrioritizeDestination]: (destinationName: string) => ({
    name:
      destinationName === "Infisical"
        ? "Import Destination Secrets - Prioritize Destination (Remote Instance) Values"
        : `Import Destination Secrets - Prioritize ${destinationName} Values`,
    description: `Infisical will import any secrets present in the ${destinationName} destination prior to syncing, prioritizing values from ${destinationName} over Infisical when keys conflict.`
  })
};

export const SECRET_SYNC_IMPORT_BEHAVIOR_MAP: Record<
  SecretSyncImportBehavior,
  (destinationName: string) => { name: string; description: string }
> = {
  [SecretSyncImportBehavior.PrioritizeSource]: (destinationName: string) => ({
    name:
      destinationName === "Infisical"
        ? "Prioritize Source (This Instance) Values"
        : "Prioritize Infisical Values",
    description: `Infisical will import any secrets present in the ${destinationName} destination, prioritizing values from Infisical over ${destinationName} when keys conflict.`
  }),
  [SecretSyncImportBehavior.PrioritizeDestination]: (destinationName: string) => ({
    name:
      destinationName === "Infisical"
        ? "Prioritize Destination (Remote Instance) Values"
        : `Prioritize ${destinationName} Values`,
    description: `Infisical will import any secrets present in the ${destinationName} destination, prioritizing values from ${destinationName} over Infisical when keys conflict.`
  })
};

export const HUMANITEC_SYNC_SCOPES: Record<
  HumanitecSyncScope,
  { name: string; description: string }
> = {
  [HumanitecSyncScope.Application]: {
    name: "Application",
    description:
      "Infisical will sync secrets as application level shared values to the specified Humanitec application."
  },
  [HumanitecSyncScope.Environment]: {
    name: "Environment",
    description:
      "Infisical will sync secrets as environment level shared values to the specified Humanitec application environment."
  }
};

export const GCP_SYNC_SCOPES: Record<GcpSyncScope, { name: string; description: string }> = {
  [GcpSyncScope.Global]: {
    name: "Global",
    description: "Secrets will be synced globally; being available in all project regions."
  },
  [GcpSyncScope.Region]: {
    name: "Region",
    description: "Secrets will be synced to the specified region."
  }
};

export const RENDER_SYNC_SCOPES: Record<RenderSyncScope, { name: string; description: string }> = {
  [RenderSyncScope.Service]: {
    name: "Service",
    description: "Infisical will sync secrets to the specified Render service."
  },
  [RenderSyncScope.EnvironmentGroup]: {
    name: "EnvironmentGroup",
    description: "Infisical will sync secrets to the specified Render environment group."
  }
};
