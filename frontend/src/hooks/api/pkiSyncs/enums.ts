export enum PkiSync {
  AzureKeyVault = "azure-key-vault",
  AwsCertificateManager = "aws-certificate-manager"
}

export enum PkiSyncStatus {
  Pending = "pending",
  Running = "running",
  Succeeded = "succeeded",
  Failed = "failed"
}
