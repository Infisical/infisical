import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  SecretSync,
  SecretSyncImportBehavior,
  SecretSyncInitialSyncBehavior
} from "@app/hooks/api/secretSyncs";

export const SECRET_SYNC_MAP: Record<SecretSync, { name: string; image: string }> = {
  [SecretSync.AWSParameterStore]: { name: "AWS Parameter Store", image: "Amazon Web Services.png" },
  [SecretSync.AWSSecretsManager]: { name: "AWS Secrets Manager", image: "Amazon Web Services.png" },
  [SecretSync.GitHub]: { name: "GitHub", image: "GitHub.png" },
  [SecretSync.GCPSecretManager]: { name: "GCP Secret Manager", image: "Google Cloud Platform.png" },
  [SecretSync.AzureKeyVault]: { name: "Azure Key Vault", image: "Microsoft Azure.png" },
  [SecretSync.AzureAppConfiguration]: {
    name: "Azure App Configuration",
    image: "Microsoft Azure.png"
  }
};

export const SECRET_SYNC_CONNECTION_MAP: Record<SecretSync, AppConnection> = {
  [SecretSync.AWSParameterStore]: AppConnection.AWS,
  [SecretSync.AWSSecretsManager]: AppConnection.AWS,
  [SecretSync.GitHub]: AppConnection.GitHub,
  [SecretSync.GCPSecretManager]: AppConnection.GCP,
  [SecretSync.AzureKeyVault]: AppConnection.AzureKeyVault,
  [SecretSync.AzureAppConfiguration]: AppConnection.AzureAppConfiguration
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
