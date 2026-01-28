export enum AppConnection {
  GitHub = "github",
  GitHubRadar = "github-radar",
  AWS = "aws",
  Databricks = "databricks",
  GCP = "gcp",
  AzureKeyVault = "azure-key-vault",
  AzureAppConfiguration = "azure-app-configuration",
  AzureClientSecrets = "azure-client-secrets",
  AzureDevOps = "azure-devops",
  AzureADCS = "azure-adcs",
  AzureDNS = "azure-dns",
  Humanitec = "humanitec",
  TerraformCloud = "terraform-cloud",
  Vercel = "vercel",
  Postgres = "postgres",
  MsSql = "mssql",
  MySql = "mysql",
  Camunda = "camunda",
  Windmill = "windmill",
  Auth0 = "auth0",
  HCVault = "hashicorp-vault",
  LDAP = "ldap",
  TeamCity = "teamcity",
  OCI = "oci",
  OracleDB = "oracledb",
  OnePass = "1password",
  Heroku = "heroku",
  Render = "render",
  Flyio = "flyio",
  GitLab = "gitlab",
  Cloudflare = "cloudflare",
  DNSMadeEasy = "dns-made-easy",
  Zabbix = "zabbix",
  Railway = "railway",
  Bitbucket = "bitbucket",
  Checkly = "checkly",
  Supabase = "supabase",
  DigitalOcean = "digital-ocean",
  Netlify = "netlify",
  Okta = "okta",
  Redis = "redis",
  MongoDB = "mongodb",
  LaravelForge = "laravel-forge",
  Chef = "chef",
  Northflank = "northflank",
  OctopusDeploy = "octopus-deploy",
  SSH = "ssh"
}

export enum AWSRegion {
  // US
  US_EAST_1 = "us-east-1", // N. Virginia
  US_EAST_2 = "us-east-2", // Ohio
  US_WEST_1 = "us-west-1", // N. California
  US_WEST_2 = "us-west-2", // Oregon

  // GovCloud
  US_GOV_EAST_1 = "us-gov-east-1", // US-East
  US_GOV_WEST_1 = "us-gov-west-1", // US-West

  // Africa
  AF_SOUTH_1 = "af-south-1", // Cape Town

  // Asia Pacific
  AP_EAST_1 = "ap-east-1", // Hong Kong
  AP_SOUTH_1 = "ap-south-1", // Mumbai
  AP_SOUTH_2 = "ap-south-2", // Hyderabad
  AP_NORTHEAST_1 = "ap-northeast-1", // Tokyo
  AP_NORTHEAST_2 = "ap-northeast-2", // Seoul
  AP_NORTHEAST_3 = "ap-northeast-3", // Osaka
  AP_SOUTHEAST_1 = "ap-southeast-1", // Singapore
  AP_SOUTHEAST_2 = "ap-southeast-2", // Sydney
  AP_SOUTHEAST_3 = "ap-southeast-3", // Jakarta
  AP_SOUTHEAST_4 = "ap-southeast-4", // Melbourne

  // Canada
  CA_CENTRAL_1 = "ca-central-1", // Central

  // Europe
  EU_CENTRAL_1 = "eu-central-1", // Frankfurt
  EU_CENTRAL_2 = "eu-central-2", // Zurich
  EU_WEST_1 = "eu-west-1", // Ireland
  EU_WEST_2 = "eu-west-2", // London
  EU_WEST_3 = "eu-west-3", // Paris
  EU_SOUTH_1 = "eu-south-1", // Milan
  EU_SOUTH_2 = "eu-south-2", // Spain
  EU_NORTH_1 = "eu-north-1", // Stockholm

  // Middle East
  ME_SOUTH_1 = "me-south-1", // Bahrain
  ME_CENTRAL_1 = "me-central-1", // UAE

  // South America
  SA_EAST_1 = "sa-east-1" // Sao Paulo
}

export enum AppConnectionPlanType {
  Enterprise = "enterprise",
  Regular = "regular"
}
