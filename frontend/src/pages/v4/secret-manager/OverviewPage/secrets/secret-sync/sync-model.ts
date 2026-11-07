import { SecretSync } from "@app/hooks/api/secretSyncs/enums";

export type LocalSecretSync = {
  id: string;
  name: string;
  destination: string;
  project: string;
  environment: string;
  path: string;
  status: "succeeded" | "failed" | "running" | "pending" | null;
  autoSync: boolean;
  lastSyncedAt?: string;
  lastSyncMessage?: string;
  description?: string;
  connectionId?: string;
  connectionName?: string;
  destinationConfig?: Record<string, unknown>;
  syncOptions?: Record<string, unknown>;
};

export const PORTED_SYNCS: readonly SecretSync[] = [
  SecretSync.AWSParameterStore,
  SecretSync.AWSSecretsManager,
  SecretSync.GitHub,
  SecretSync.GCPSecretManager,
  SecretSync.AzureKeyVault,
  SecretSync.Vercel
];

export const IMPORT_CAPABLE_SYNCS: readonly SecretSync[] = [
  SecretSync.OnePass,
  SecretSync.AWSParameterStore,
  SecretSync.AWSSecretsManager,
  SecretSync.AzureAppConfiguration,
  SecretSync.AzureKeyVault,
  SecretSync.Camunda,
  SecretSync.Cloud66,
  SecretSync.ExternalInfisical,
  SecretSync.GCPSecretManager,
  SecretSync.HasuraCloud,
  SecretSync.HCVault,
  SecretSync.Heroku,
  SecretSync.Keeper,
  SecretSync.LaravelForge,
  SecretSync.Netlify,
  SecretSync.Northflank,
  SecretSync.OVH,
  SecretSync.Portainer,
  SecretSync.Railway,
  SecretSync.Render,
  SecretSync.TeamCity,
  SecretSync.Vercel,
  SecretSync.Windmill,
  SecretSync.Zabbix
];

export type LocalSyncConnection = { id: string; name: string; app: string };
