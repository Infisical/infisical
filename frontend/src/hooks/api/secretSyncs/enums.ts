export enum SecretSync {
  AWSParameterStore = "aws-parameter-store",
  AWSSecretsManager = "aws-secrets-manager",
  GitHub = "github",
  GCPSecretManager = "gcp-secret-manager",
  AzureKeyVault = "azure-key-vault",
  AzureAppConfiguration = "azure-app-configuration",
  Databricks = "databricks",
  Humanitec = "humanitec",
  TerraformCloud = "terraform-cloud",
  Camunda = "camunda",
  Vercel = "vercel",
  Windmill = "windmill",
  HCVault = "hashicorp-vault",
  TeamCity = "teamcity"
}

export enum SecretSyncStatus {
  Pending = "pending",
  Running = "running",
  Succeeded = "succeeded",
  Failed = "failed"
}

export enum SecretSyncInitialSyncBehavior {
  OverwriteDestination = "overwrite-destination",
  ImportPrioritizeSource = "import-prioritize-source",
  ImportPrioritizeDestination = "import-prioritize-destination"
}

export enum SecretSyncImportBehavior {
  PrioritizeSource = "prioritize-source",
  PrioritizeDestination = "prioritize-destination"
}
