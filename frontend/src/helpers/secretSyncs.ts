import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  SecretSync,
  SecretSyncImportBehavior,
  SecretSyncInitialSyncBehavior
} from "@app/hooks/api/secretSyncs";
import { GcpSyncScope } from "@app/hooks/api/secretSyncs/types/gcp-sync";
import { HumanitecSyncScope } from "@app/hooks/api/secretSyncs/types/humanitec-sync";
import { RenderSyncScope } from "@app/hooks/api/secretSyncs/types/render-sync";

export const SECRET_SYNC_MAP: Record<SecretSync, { name: string; image: string }> = {
  [SecretSync.AWSParameterStore]: { name: "AWS Parameter Store", image: "Amazon Web Services.png" },
  [SecretSync.AWSSecretsManager]: { name: "AWS Secrets Manager", image: "Amazon Web Services.png" },
  [SecretSync.GitHub]: { name: "GitHub", image: "GitHub.png" },
  [SecretSync.GCPSecretManager]: { name: "GCP Secret Manager", image: "Google Cloud Platform.png" },
  [SecretSync.AzureKeyVault]: { name: "Azure Key Vault", image: "Microsoft Azure.png" },
  [SecretSync.AzureAppConfiguration]: {
    name: "Azure App Configuration",
    image: "Microsoft Azure.png"
  },
  [SecretSync.AzureDevOps]: {
    name: "Azure DevOps",
    image: "Microsoft Azure.png"
  },
  [SecretSync.Databricks]: {
    name: "Databricks",
    image: "Databricks.png"
  },
  [SecretSync.Humanitec]: {
    name: "Humanitec",
    image: "Humanitec.png"
  },
  [SecretSync.TerraformCloud]: {
    name: "Terraform Cloud",
    image: "Terraform Cloud.png"
  },
  [SecretSync.Camunda]: {
    name: "Camunda",
    image: "Camunda.png"
  },
  [SecretSync.Vercel]: {
    name: "Vercel",
    image: "Vercel.png"
  },
  [SecretSync.Windmill]: {
    name: "Windmill",
    image: "Windmill.png"
  },
  [SecretSync.HCVault]: {
    name: "Hashicorp Vault",
    image: "Vault.png"
  },
  [SecretSync.TeamCity]: {
    name: "TeamCity",
    image: "TeamCity.png"
  },
  [SecretSync.OCIVault]: {
    name: "OCI Vault",
    image: "Oracle.png"
  },
  [SecretSync.OnePass]: {
    name: "1Password",
    image: "1Password.png"
  },
  [SecretSync.Heroku]: {
    name: "Heroku",
    image: "Heroku.png"
  },
  [SecretSync.Render]: {
    name: "Render",
    image: "Render.png"
  },
  [SecretSync.Flyio]: {
    name: "Fly.io",
    image: "Flyio.svg"
  },
  [SecretSync.GitLab]: {
    name: "GitLab",
    image: "GitLab.png"
  },
  [SecretSync.CloudflarePages]: {
    name: "Cloudflare Pages",
    image: "Cloudflare.png"
  },
  [SecretSync.CloudflareWorkers]: {
    name: "Cloudflare Workers",
    image: "Cloudflare.png"
  },
  [SecretSync.Zabbix]: {
    name: "Zabbix",
    image: "Zabbix.png"
  },
  [SecretSync.Railway]: {
    name: "Railway",
    image: "Railway.png"
  },
  [SecretSync.Checkly]: {
    name: "Checkly",
    image: "Checkly.png"
  },
  [SecretSync.Supabase]: {
    name: "Supabase",
    image: "Supabase.png"
  },
  [SecretSync.Convex]: {
    name: "Convex",
    image: "Convex.png"
  },
  [SecretSync.DigitalOceanAppPlatform]: {
    name: "Digital Ocean App Platform",
    image: "Digital Ocean.png"
  },
  [SecretSync.Netlify]: {
    name: "Netlify",
    image: "Netlify.png"
  },
  [SecretSync.Bitbucket]: {
    name: "Bitbucket",
    image: "Bitbucket.png"
  },
  [SecretSync.Northflank]: {
    name: "Northflank",
    image: "Northflank.png"
  },
  [SecretSync.LaravelForge]: {
    name: "Laravel Forge",
    image: "Laravel Forge.png"
  },
  [SecretSync.Chef]: {
    name: "Chef",
    image: "Chef.png"
  },
  [SecretSync.OctopusDeploy]: {
    name: "Octopus Deploy",
    image: "Octopus Deploy.png"
  }
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
  [SecretSync.Convex]: AppConnection.Convex,
  [SecretSync.Zabbix]: AppConnection.Zabbix,
  [SecretSync.Railway]: AppConnection.Railway,
  [SecretSync.Checkly]: AppConnection.Checkly,
  [SecretSync.DigitalOceanAppPlatform]: AppConnection.DigitalOcean,
  [SecretSync.Netlify]: AppConnection.Netlify,
  [SecretSync.Northflank]: AppConnection.Northflank,
  [SecretSync.Bitbucket]: AppConnection.Bitbucket,
  [SecretSync.LaravelForge]: AppConnection.LaravelForge,
  [SecretSync.Chef]: AppConnection.Chef,
  [SecretSync.OctopusDeploy]: AppConnection.OctopusDeploy
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
    name: "Import Destination Secrets - Prioritize Infisical Values",
    description: `Infisical will import any secrets present in the ${destinationName} destination prior to syncing, prioritizing values from Infisical over ${destinationName} when keys conflict.`
  }),
  [SecretSyncInitialSyncBehavior.ImportPrioritizeDestination]: (destinationName: string) => ({
    name: `Import Destination Secrets - Prioritize ${destinationName} Values`,
    description: `Infisical will import any secrets present in the ${destinationName} destination prior to syncing, prioritizing values from ${destinationName} over Infisical when keys conflict.`
  })
};

export const SECRET_SYNC_IMPORT_BEHAVIOR_MAP: Record<
  SecretSyncImportBehavior,
  (destinationName: string) => { name: string; description: string }
> = {
  [SecretSyncImportBehavior.PrioritizeSource]: (destinationName: string) => ({
    name: "Prioritize Infisical Values",
    description: `Infisical will import any secrets present in the ${destinationName} destination, prioritizing values from Infisical over ${destinationName} when keys conflict.`
  }),
  [SecretSyncImportBehavior.PrioritizeDestination]: (destinationName: string) => ({
    name: `Prioritize ${destinationName} Values`,
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
