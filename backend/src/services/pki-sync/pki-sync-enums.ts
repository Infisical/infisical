export enum PkiSync {
  AzureKeyVault = "azure-key-vault"
}

export enum PkiSyncStatus {
  Pending = "PENDING",
  Running = "RUNNING",
  Success = "SUCCESS",
  Failed = "FAILED"
}

export enum PkiSyncImportBehavior {
  ImportAllSecrets = "IMPORT_ALL_SECRETS",
  PreferInfisicalSecrets = "PREFER_INFISICAL_SECRETS",
  PreferExternalSecrets = "PREFER_EXTERNAL_SECRETS"
}

export enum PkiSyncAction {
  SyncCertificates = "sync-certificates",
  ImportCertificates = "import-certificates",
  RemoveCertificates = "remove-certificates"
}
