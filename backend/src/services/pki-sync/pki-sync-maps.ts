import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { PkiSync } from "./pki-sync-enums";

export const PKI_SYNC_NAME_MAP: Record<PkiSync, string> = {
  [PkiSync.AzureKeyVault]: "Azure Key Vault",
  [PkiSync.AwsCertificateManager]: "AWS Certificate Manager",
  [PkiSync.AwsSecretsManager]: "AWS Secrets Manager",
  [PkiSync.Chef]: "Chef"
};

export const PKI_SYNC_CONNECTION_MAP: Record<PkiSync, AppConnection> = {
  [PkiSync.AzureKeyVault]: AppConnection.AzureKeyVault,
  [PkiSync.AwsCertificateManager]: AppConnection.AWS,
  [PkiSync.AwsSecretsManager]: AppConnection.AWS,
  [PkiSync.Chef]: AppConnection.Chef
};
