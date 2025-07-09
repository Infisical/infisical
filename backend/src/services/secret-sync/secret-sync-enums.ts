export enum SecretSync {
  AWSParameterStore = "aws-parameter-store",
  AWSSecretsManager = "aws-secrets-manager",
  GitHub = "github",
  GCPSecretManager = "gcp-secret-manager",
  AzureKeyVault = "azure-key-vault",
  AzureAppConfiguration = "azure-app-configuration",
  AzureDevOps = "azure-devops",
  Databricks = "databricks",
  Humanitec = "humanitec",
  TerraformCloud = "terraform-cloud",
  Camunda = "camunda",
  Vercel = "vercel",
  Windmill = "windmill",
  HCVault = "hashicorp-vault",
  TeamCity = "teamcity",
  OCIVault = "oci-vault",
  OnePass = "1password",
  Heroku = "heroku",
  Render = "render",
  Flyio = "flyio",
  GitLab = "gitlab",
  CloudflarePages = "cloudflare-pages",
  Zabbix = "zabbix"
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

export enum SecretSyncPlanType {
  Enterprise = "enterprise",
  Regular = "regular"
}
