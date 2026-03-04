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
  CloudflareWorkers = "cloudflare-workers",
  Supabase = "supabase",
  Zabbix = "zabbix",
  Railway = "railway",
  Checkly = "checkly",
  DigitalOceanAppPlatform = "digital-ocean-app-platform",
  Netlify = "netlify",
  Northflank = "northflank",
  Bitbucket = "bitbucket",
  LaravelForge = "laravel-forge",
  Chef = "chef",
  OctopusDeploy = "octopus-deploy",
  CircleCI = "circleci"
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
