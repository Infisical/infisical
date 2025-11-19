export enum PkiSync {
  AzureKeyVault = "azure-key-vault",
  AwsCertificateManager = "aws-certificate-manager",
  AwsSecretsManager = "aws-secrets-manager",
  Chef = "chef"
}

export enum PkiSyncStatus {
  Pending = "pending",
  Running = "running",
  Succeeded = "succeeded",
  Failed = "failed"
}

export enum PkiSyncAction {
  SyncCertificates = "sync-certificates",
  ImportCertificates = "import-certificates",
  RemoveCertificates = "remove-certificates"
}
