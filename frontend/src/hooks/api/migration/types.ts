export enum ExternalMigrationProviders {
  Vault = "vault",
  EnvKey = "env-key"
}

export type TExternalMigrationConfig = {
  id: string;
  orgId: string;
  platform: string;
  connectionId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TImportVaultSecretsDTO = {
  projectId: string;
  environment: string;
  secretPath: string;
  vaultNamespace: string;
  vaultSecretPath: string;
};
