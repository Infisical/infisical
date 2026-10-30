import { z } from "zod";

import { isValidIpOrCidr } from "@app/helpers/ip";
import {
  containsDangerousSmbChars,
  SMB_USERNAME_REGEX,
  SMB_VALIDATION_LIMITS,
  validateSmbPassword
} from "@app/helpers/smb";
import { DistinguishedNameRegex, UserPrincipalNameRegex } from "@app/helpers/string";
import { groupBy, unique } from "@app/lib/fn/array";
import { SecretNameSchema, slugSchema } from "@app/lib/schemas";

export enum SupabaseApiKeyType {
  Publishable = "publishable",
  Secret = "secret"
}
export enum OpenRouterLimitReset {
  Daily = "daily",
  Weekly = "weekly",
  Monthly = "monthly"
}
export enum CloudflareR2Jurisdiction {
  Default = "default",
  Eu = "eu",
  FedRamp = "fedramp"
}
export enum WindowsLocalAccountRotationMethod {
  LoginAsTarget = "login-as-target",
  LoginAsRoot = "login-as-root"
}
export enum UnixLinuxLocalAccountRotationMethod {
  LoginAsTarget = "login-as-target",
  LoginAsRoot = "login-as-root"
}
export enum HpIloRotationMethod {
  LoginAsTarget = "login-as-target",
  LoginAsRoot = "login-as-root"
}
export enum LdapPasswordRotationMethod {
  ConnectionPrincipal = "connection-principal",
  TargetPrincipal = "target-principal"
}
export enum SecretRotationStatus {
  Success = "success",
  Failed = "failed"
}
export enum SecretRotation {
  PostgresCredentials = "postgres-credentials",
  MsSqlCredentials = "mssql-credentials",
  MySqlCredentials = "mysql-credentials",
  OracleDBCredentials = "oracledb-credentials",
  Auth0ClientSecret = "auth0-client-secret",
  AzureClientSecret = "azure-client-secret",
  LdapPassword = "ldap-password",
  AwsIamUserSecret = "aws-iam-user-secret",
  OktaClientSecret = "okta-client-secret",
  RedisCredentials = "redis-credentials",
  MongoDBCredentials = "mongodb-credentials",
  DatabricksServicePrincipalSecret = "databricks-service-principal-secret",
  UnixLinuxLocalAccount = "unix-linux-local-account",
  DbtServiceToken = "dbt-service-token",
  WindowsLocalAccount = "windows-local-account",
  OpenRouterApiKey = "open-router-api-key",
  LiteLLMApiKey = "litellm-api-key",
  OpenAIServiceAccount = "openai-service-account",
  HpIloLocalAccount = "hp-ilo-local-account",
  SupabaseApiKey = "supabase-api-key",
  SalesforceOauthCredentials = "salesforce-oauth-credentials",
  DatadogApplicationKeySecret = "datadog-application-key-secret",
  DatadogApiKey = "datadog-api-key",
  ConvexAccessKey = "convex-access-key",
  FireworksApiKey = "fireworks-api-key",
  SnowflakeUserKeyPair = "snowflake-user-key-pair",
  CloudflareApiToken = "cloudflare-api-token",
  CloudflareR2AccessKey = "cloudflare-r2-access-key",
  StripeApiKey = "stripe-api-key",
  GcpServiceAccountKey = "gcp-service-account-key"
}
export enum AppConnection {
  AWS = "aws",
  GitHub = "github",
  GitHubRadar = "github-radar",
  GCP = "gcp",
  AzureKeyVault = "azure-key-vault",
  AzureAppConfiguration = "azure-app-configuration",
  AzureClientSecrets = "azure-client-secrets",
  MicrosoftIntune = "microsoft-intune",
  AzureDevOps = "azure-devops",
  AzureADCS = "azure-adcs",
  ADCS = "adcs",
  AzureDNS = "azure-dns",
  PowerDns = "powerdns",
  Databricks = "databricks",
  Humanitec = "humanitec",
  TerraformCloud = "terraform-cloud",
  Vercel = "vercel",
  Postgres = "postgres",
  MsSql = "mssql",
  MySql = "mysql",
  OracleDB = "oracledb",
  Camunda = "camunda",
  Windmill = "windmill",
  Auth0 = "auth0",
  HCVault = "hashicorp-vault",
  LDAP = "ldap",
  TeamCity = "teamcity",
  OCI = "oci",
  OnePass = "1password",
  Heroku = "heroku",
  Render = "render",
  Flyio = "flyio",
  GitLab = "gitlab",
  Cloudflare = "cloudflare",
  DNSMadeEasy = "dns-made-easy",
  UltraDNS = "ultradns",
  Bitbucket = "bitbucket",
  Zabbix = "zabbix",
  Railway = "railway",
  Checkly = "checkly",
  Supabase = "supabase",
  DigitalOcean = "digital-ocean",
  Netlify = "netlify",
  Northflank = "northflank",
  Okta = "okta",
  Redis = "redis",
  MongoDB = "mongodb",
  LaravelForge = "laravel-forge",
  Chef = "chef",
  OctopusDeploy = "octopus-deploy",
  SSH = "ssh",
  Dbt = "dbt",
  SMB = "smb",
  WinRM = "winrm",
  OpenRouter = "open-router",
  OpenAI = "openai",
  CircleCI = "circleci",
  AzureEntraId = "azure-entra-id",
  Venafi = "venafi",
  VenafiTpp = "venafi-tpp",
  ExternalInfisical = "external-infisical",
  Doppler = "doppler",
  NetScaler = "netscaler",
  PaloAltoNetworks = "palo-alto-networks",
  KempLoadMaster = "kemp-loadmaster",
  Anthropic = "anthropic",
  OVH = "ovh",
  Devin = "devin",
  Ona = "ona",
  DigiCert = "digicert",
  TravisCI = "travis-ci",
  Salesforce = "salesforce",
  Snowflake = "snowflake",
  Datadog = "datadog",
  F5BigIp = "f5-big-ip",
  GoDaddy = "godaddy",
  Convex = "convex",
  TriggerDev = "trigger-dev",
  Rundeck = "rundeck",
  Portainer = "portainer",
  HasuraCloud = "hasura-cloud",
  Qovery = "qovery",
  Cloud66 = "cloud-66",
  LiteLLM = "litellm",
  Fireworks = "fireworks",
  NutanixPrismCentral = "nutanix-prism-central",
  Spacelift = "spacelift",
  Daytona = "daytona",
  Stripe = "stripe",
  Keeper = "keeper",
  HpeIloRedFish = "hpe-ilo",
  S3Compatible = "s3-compatible"
}
export const BaseSecretRotationSchema = z.object({
  name: slugSchema({ field: "Name" }),
  description: z.string().trim().max(256, "Cannot exceed 256 characters").nullish(),
  connection: z.object({
    name: z.string(),
    id: z.string().uuid(),
    app: z.nativeEnum(AppConnection).optional()
  }),
  environment: z.object({ slug: z.string(), id: z.string(), name: z.string() }),
  secretPath: z.string().min(1, "Secret path required"),
  isAutoRotationEnabled: z.boolean(),
  rotationInterval: z.coerce.number(),
  rotateAtUtc: z.object({
    hours: z.number(),
    minutes: z.number()
  })
});
export const Auth0ClientSecretRotationSchema = z
  .object({
    type: z.literal(SecretRotation.Auth0ClientSecret),
    parameters: z.object({
      clientId: z.string().trim().min(1, "Client ID required")
    }),
    secretsMapping: z.object({
      clientId: z.string().trim().min(1, "Client ID required"),
      clientSecret: z.string().trim().min(1, "Client Secret required")
    })
  })
  .merge(BaseSecretRotationSchema);
export const AwsIamUserSecretRotationSchema = z
  .object({
    type: z.literal(SecretRotation.AwsIamUserSecret),
    parameters: z.object({
      userName: z.string().trim().min(1, "User Name required"),
      region: z.string().trim().optional()
    }),
    secretsMapping: z.object({
      accessKeyId: z.string().trim().min(1, "Access Key ID required"),
      secretAccessKey: z.string().trim().min(1, "Secret Access Key required")
    })
  })
  .merge(BaseSecretRotationSchema);
export const AzureClientSecretRotationSchema = z
  .object({
    type: z.literal(SecretRotation.AzureClientSecret),
    parameters: z.object({
      objectId: z.string().trim().min(1, "Object ID required"),
      appName: z.string().trim().min(1, "App Name required"),
      clientId: z.string().trim().min(1, "Client ID required")
    }),
    secretsMapping: z.object({
      clientId: z.string().trim().min(1, "Client ID required"),
      clientSecret: z.string().trim().min(1, "Client Secret required")
    })
  })
  .merge(BaseSecretRotationSchema);
export const DatabricksServicePrincipalSecretRotationSchema = z
  .object({
    type: z.literal(SecretRotation.DatabricksServicePrincipalSecret),
    parameters: z.object({
      servicePrincipalId: z.string().trim().min(1, "Service Principal ID required"),
      servicePrincipalName: z.string().trim().optional(),
      clientId: z.string().trim().min(1, "Client ID required")
    }),
    secretsMapping: z.object({
      clientId: z.string().trim().min(1, "Client ID required"),
      clientSecret: z.string().trim().min(1, "Client Secret required")
    })
  })
  .merge(BaseSecretRotationSchema);
export const CLOUDFLARE_TOKEN_NAME_MAX_LENGTH = 100;
export const CloudflareTokenIpRestrictionsSchema = z
  .string()
  .trim()
  .array()
  .optional()
  .refine(
    (ips) => !ips || ips.every(isValidIpOrCidr),
    "Each entry must be a valid IP address or CIDR block"
  );
export const CloudflareTokenNameSchema = z
  .string()
  .trim()
  .min(1, "Token name required")
  .max(CLOUDFLARE_TOKEN_NAME_MAX_LENGTH, "Token name too long");
export type TPasswordRequirements = z.infer<typeof PasswordRequirementsSchema>;
export const PasswordRequirementsSchema = z
  .object({
    length: z
      .number({ invalid_type_error: "Password length is required" })
      .min(1, "Password length must be a positive number")
      .max(250, "Password length must be less than 250"),
    required: z.object({
      digits: z
        .number({ invalid_type_error: "Digit count is required" })
        .min(0, "Digit count must be non-negative"),
      lowercase: z
        .number({ invalid_type_error: "Lowercase count is required" })
        .min(0, "Lowercase count must be non-negative"),
      uppercase: z
        .number({ invalid_type_error: "Uppercase count is required" })
        .min(0, "Uppercase count must be non-negative"),
      symbols: z
        .number({ invalid_type_error: "Symbol count is required" })
        .min(0, "Symbol count must be non-negative")
    }),
    allowedSymbols: z
      .string()
      .regex(/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~]/, "Invalid symbols")
      .optional()
      .transform((value) => value || "-_.~!*")
  })
  .refine(
    (data) => {
      return Object.values(data.required).some((count) => count > 0);
    },
    {
      message: "At least one character type must be required",
      path: ["required.digits"]
    }
  )
  .refine(
    (data) => {
      const total = Object.values(data.required).reduce((sum, count) => sum + count, 0);
      return total <= data.length;
    },
    { message: "Sum of required characters cannot exceed the total length", path: ["length"] }
  );
export const DEFAULT_PASSWORD_REQUIREMENTS = {
  length: 48,
  required: {
    lowercase: 1,
    uppercase: 1,
    digits: 1,
    symbols: 0
  },
  allowedSymbols: "-_.~!*"
};
export const SqlCredentialsRotationSchema = z.object({
  parameters: z.object({
    username1: z.string().trim().min(1, "Database Username 1 Required"),
    username2: z.string().trim().min(1, "Database Username 2 Required"),
    rotationStatement: z.string().trim().min(1).optional(),
    passwordRequirements: PasswordRequirementsSchema.optional()
  }),
  secretsMapping: z.object({
    username: SecretNameSchema,
    password: SecretNameSchema
  })
});
export const LdapPasswordRotationSchema = z
  .object({
    type: z.literal(SecretRotation.LdapPassword),
    parameters: z.object({
      dn: z
        .string()
        .trim()
        .min(1, "DN/UPN required")
        .refine(
          (value) => DistinguishedNameRegex.test(value) || UserPrincipalNameRegex.test(value),
          {
            message: "Invalid DN/UPN format"
          }
        ),
      passwordRequirements: PasswordRequirementsSchema.optional(),
      rotationMethod: z.nativeEnum(LdapPasswordRotationMethod).optional()
    }),
    secretsMapping: z.object({
      dn: z.string().trim().min(1, "DN/UPN required"),
      password: z.string().trim().min(1, "Password required")
    }),
    temporaryParameters: z
      .object({
        password: z.string().min(1, "Password required")
      })
      .optional()
  })
  .merge(BaseSecretRotationSchema);
export const MongoDBCredentialsRotationSchema = z
  .object({
    type: z.literal(SecretRotation.MongoDBCredentials)
  })
  .merge(SqlCredentialsRotationSchema)
  .merge(BaseSecretRotationSchema);
export const MsSqlCredentialsRotationSchema = z
  .object({
    type: z.literal(SecretRotation.MsSqlCredentials)
  })
  .merge(SqlCredentialsRotationSchema)
  .merge(BaseSecretRotationSchema);
export const MySqlCredentialsRotationSchema = z
  .object({
    type: z.literal(SecretRotation.MySqlCredentials)
  })
  .merge(SqlCredentialsRotationSchema)
  .merge(BaseSecretRotationSchema);
export const PostgresCredentialsRotationSchema = z
  .object({
    type: z.literal(SecretRotation.PostgresCredentials)
  })
  .merge(SqlCredentialsRotationSchema)
  .merge(BaseSecretRotationSchema);
export enum CloudflareApiTokenPolicyEffect {
  Allow = "allow",
  Deny = "deny"
}
export enum CloudflareApiTokenPolicyScope {
  Account = "account",
  AllZones = "all-zones",
  Zones = "zones"
}
export const CLOUDFLARE_POLICY_EFFECT_MAP: Record<CloudflareApiTokenPolicyEffect, string> = {
  [CloudflareApiTokenPolicyEffect.Allow]: "Allow",
  [CloudflareApiTokenPolicyEffect.Deny]: "Deny"
};
export const CLOUDFLARE_POLICY_SCOPE_MAP: Record<CloudflareApiTokenPolicyScope, string> = {
  [CloudflareApiTokenPolicyScope.Account]: "Entire account",
  [CloudflareApiTokenPolicyScope.AllZones]: "All zones",
  [CloudflareApiTokenPolicyScope.Zones]: "Specific zones"
};
export const CLOUDFLARE_POLICY_SCOPE_RESOURCE_MAP: Record<CloudflareApiTokenPolicyScope, string> = {
  [CloudflareApiTokenPolicyScope.Account]: "com.cloudflare.api.account",
  [CloudflareApiTokenPolicyScope.AllZones]: "com.cloudflare.api.account.zone",
  [CloudflareApiTokenPolicyScope.Zones]: "com.cloudflare.api.account.zone"
};
export const CloudflareApiTokenPolicyRowSchema = z
  .object({
    effect: z.nativeEnum(CloudflareApiTokenPolicyEffect),
    scope: z.nativeEnum(CloudflareApiTokenPolicyScope),
    zoneIds: z.string().trim().array().optional(),
    permissionGroupId: z.string().trim().min(1, "Permission group required")
  })
  .superRefine((policy, ctx) => {
    if (policy.scope === CloudflareApiTokenPolicyScope.Zones && !policy.zoneIds?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["zoneIds"],
        message: "At least one zone is required"
      });
    }
  });
export type TCloudflareApiTokenPolicyRow = z.infer<typeof CloudflareApiTokenPolicyRowSchema>;
export type TCloudflareApiTokenPolicyStored = Omit<
  TCloudflareApiTokenPolicyRow,
  "permissionGroupId"
> & {
  permissionGroupIds: string[];
};
const policyResourceKey = ({ effect, scope, zoneIds }: TCloudflareApiTokenPolicyRow) =>
  `${effect}|${scope}|${[...(zoneIds ?? [])].sort().join(",")}`;
export const mergePolicyRows = (
  rows: TCloudflareApiTokenPolicyRow[]
): TCloudflareApiTokenPolicyStored[] =>
  Object.values(groupBy(rows, policyResourceKey)).map((group) => ({
    effect: group[0].effect,
    scope: group[0].scope,
    zoneIds: group[0].zoneIds,
    permissionGroupIds: unique(group.map((row) => row.permissionGroupId))
  }));
export const explodePolicies = (
  policies: TCloudflareApiTokenPolicyStored[]
): TCloudflareApiTokenPolicyRow[] =>
  policies.flatMap(({ effect, scope, zoneIds, permissionGroupIds }) =>
    permissionGroupIds.map((permissionGroupId) => ({ effect, scope, zoneIds, permissionGroupId }))
  );
export const isStoredPolicy = (policy: unknown): policy is TCloudflareApiTokenPolicyStored =>
  typeof policy === "object" && policy !== null && "permissionGroupIds" in policy;
export const CloudflareApiTokenRotationSchema = z
  .object({
    type: z.literal(SecretRotation.CloudflareApiToken),
    parameters: z.object({
      name: CloudflareTokenNameSchema,
      policies: CloudflareApiTokenPolicyRowSchema.array()
        .min(1, "At least one policy is required")
        .transform(mergePolicyRows),
      allowedIps: CloudflareTokenIpRestrictionsSchema,
      disallowedIps: CloudflareTokenIpRestrictionsSchema
    }),
    secretsMapping: z.object({
      tokenId: z.string().trim().min(1, "Token ID secret name required"),
      apiToken: z.string().trim().min(1, "API Token secret name required")
    })
  })
  .merge(BaseSecretRotationSchema);
export enum CloudflareR2AccessLevel {
  ObjectRead = "object-read",
  ObjectReadWrite = "object-read-write"
}
export const CLOUDFLARE_R2_ACCESS_LEVEL_MAP: Record<CloudflareR2AccessLevel, string> = {
  [CloudflareR2AccessLevel.ObjectRead]: "Object Read only",
  [CloudflareR2AccessLevel.ObjectReadWrite]: "Object Read & Write"
};
export const CLOUDFLARE_R2_JURISDICTION_MAP: Record<CloudflareR2Jurisdiction, string> = {
  [CloudflareR2Jurisdiction.Default]: "Default",
  [CloudflareR2Jurisdiction.Eu]: "EU",
  [CloudflareR2Jurisdiction.FedRamp]: "FedRAMP"
};
export const CloudflareR2BucketSchema = z.object({
  name: z.string().trim().min(1, "Bucket name required"),
  jurisdiction: z.nativeEnum(CloudflareR2Jurisdiction)
});
export type TCloudflareR2BucketSelection = z.infer<typeof CloudflareR2BucketSchema>;
export const r2BucketKey = ({ name, jurisdiction }: TCloudflareR2BucketSelection) =>
  `${jurisdiction}:${name}`;
export const getR2BucketLabel = ({ name, jurisdiction }: TCloudflareR2BucketSelection) =>
  jurisdiction === CloudflareR2Jurisdiction.Default
    ? name
    : `${name} (${CLOUDFLARE_R2_JURISDICTION_MAP[jurisdiction]})`;
export const CloudflareR2AccessKeyRotationSchema = z
  .object({
    type: z.literal(SecretRotation.CloudflareR2AccessKey),
    parameters: z.object({
      name: CloudflareTokenNameSchema,
      buckets: CloudflareR2BucketSchema.array()
        .min(1, "At least one bucket is required")
        .refine(
          (buckets) => new Set(buckets.map(r2BucketKey)).size === buckets.length,
          "Buckets must be unique"
        ),
      accessLevel: z.nativeEnum(CloudflareR2AccessLevel),
      allowedIps: CloudflareTokenIpRestrictionsSchema,
      disallowedIps: CloudflareTokenIpRestrictionsSchema
    }),
    secretsMapping: z.object({
      accessKeyId: z.string().trim().min(1, "Access Key ID secret name required"),
      secretAccessKey: z.string().trim().min(1, "Secret Access Key secret name required")
    })
  })
  .merge(BaseSecretRotationSchema);
export const ConvexAccessKeyRotationSchema = z
  .object({
    type: z.literal(SecretRotation.ConvexAccessKey),
    parameters: z.object({
      namePrefix: z.string().trim().min(1, "Name Prefix required")
    }),
    secretsMapping: z.object({
      accessKey: z.string().trim().min(1, "Access Key secret name required")
    })
  })
  .merge(BaseSecretRotationSchema);
export const DatadogApiKeyRotationSchema = z
  .object({
    type: z.literal(SecretRotation.DatadogApiKey),
    parameters: z.object({
      name: z.string().trim().min(1, "Key name required")
    }),
    secretsMapping: z.object({
      apiKeyId: z.string().trim().min(1, "API Key ID secret name required"),
      apiKey: z.string().trim().min(1, "API Key secret name required")
    })
  })
  .merge(BaseSecretRotationSchema);
export const DatadogApplicationKeySecretRotationSchema = z
  .object({
    type: z.literal(SecretRotation.DatadogApplicationKeySecret),
    parameters: z.object({
      serviceAccountId: z.string().trim().min(1, "Service Account required")
    }),
    secretsMapping: z.object({
      applicationKeyId: z.string().trim().min(1, "Application Key ID secret name required"),
      applicationKey: z.string().trim().min(1, "Application Key secret name required")
    })
  })
  .merge(BaseSecretRotationSchema);
export enum DbtPermissionsSet {
  AccountAdmin = "account_admin",
  AccountViewer = "account_viewer",
  Admin = "admin",
  Analyst = "analyst",
  BillingAdmin = "billing_admin",
  CostInsightsAdmin = "cost_insights_admin",
  ConstInsightViewer = "cost_insights_viewer",
  CostManagementAdmin = "cost_management_admin",
  CostManagementViewer = "cost_management_viewer",
  DatabaseAdmin = "database_admin",
  Developer = "developer",
  FusionAdmin = "fusion_admin",
  GitAdmin = "git_admin",
  JobAdmin = "job_admin",
  JobRunner = "job_runner",
  JobViewer = "job_viewer",
  ManageMarketplaceApps = "manage_marketplace_apps",
  Member = "member",
  MetadataOnly = "metadata_only",
  Owner = "owner",
  ProjectCreator = "project_creator",
  Readonly = "readonly",
  ScimOnly = "scim_only",
  SecurityAdmin = "security_admin",
  SemanticLayerOnly = "semantic_layer_only",
  Stakeholder = "stakeholder",
  TeamAdmin = "team_admin",
  WebhooksOnly = "webhooks_only"
}
export const DBT_PERMISSION_SET_MAP: Record<
  DbtPermissionsSet,
  {
    label: string;
    isEnterpriseOnly: boolean;
  }
> = {
  [DbtPermissionsSet.AccountAdmin]: {
    label: "Account Admin",
    isEnterpriseOnly: false
  },
  [DbtPermissionsSet.JobAdmin]: {
    label: "Job Admin",
    isEnterpriseOnly: false
  },
  [DbtPermissionsSet.Member]: {
    label: "Member",
    isEnterpriseOnly: false
  },
  [DbtPermissionsSet.MetadataOnly]: {
    label: "Metadata Only",
    isEnterpriseOnly: false
  },
  [DbtPermissionsSet.Readonly]: {
    label: "Readonly",
    isEnterpriseOnly: false
  },
  [DbtPermissionsSet.SemanticLayerOnly]: {
    label: "Semantic Layer Only",
    isEnterpriseOnly: false
  },
  [DbtPermissionsSet.Owner]: {
    label: "Owner",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.AccountViewer]: {
    label: "Account Viewer",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.Admin]: {
    label: "Admin",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.Analyst]: {
    label: "Analyst",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.BillingAdmin]: {
    label: "Billing Admin",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.CostInsightsAdmin]: {
    label: "Cost Insights Admin",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.ConstInsightViewer]: {
    label: "Cost Insights Viewer",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.CostManagementAdmin]: {
    label: "Cost Management Admin",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.CostManagementViewer]: {
    label: "Cost Management Viewer",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.DatabaseAdmin]: {
    label: "Database Admin",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.Developer]: {
    label: "Developer",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.FusionAdmin]: {
    label: "Fusion Admin",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.GitAdmin]: {
    label: "Git Admin",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.JobRunner]: {
    label: "Job Runner",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.JobViewer]: {
    label: "Job Viewer",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.ManageMarketplaceApps]: {
    label: "Manage Marketplace Apps",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.ProjectCreator]: {
    label: "Project Creator",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.ScimOnly]: {
    label: "SCIM Only",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.SecurityAdmin]: {
    label: "Security Admin",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.Stakeholder]: {
    label: "Stakeholder",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.TeamAdmin]: {
    label: "Team Admin",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.WebhooksOnly]: {
    label: "Webhooks Only",
    isEnterpriseOnly: true
  }
};
export const DbtTokenPermissionsSchema = z.object({
  permissionSet: z.nativeEnum(DbtPermissionsSet),
  projectId: z.number().optional()
});
export const DbtServiceTokenRotationSchema = z
  .object({
    type: z.literal(SecretRotation.DbtServiceToken),
    parameters: z.object({
      permissionGrants: DbtTokenPermissionsSchema.array(),
      tokenName: z.string().trim().min(1, "Token name required")
    }),
    secretsMapping: z.object({
      serviceToken: z.string().trim().min(1, "Service Token required")
    })
  })
  .merge(BaseSecretRotationSchema);
export const FireworksApiKeyRotationSchema = z
  .object({
    type: z.literal(SecretRotation.FireworksApiKey),
    parameters: z.object({
      serviceAccountUserId: z.string().trim().min(1, "Service account required")
    }),
    secretsMapping: z.object({
      apiKey: z.string().trim().min(1, "API key name required")
    })
  })
  .merge(BaseSecretRotationSchema);
export const GCP_SERVICE_ACCOUNT_EMAIL_MAX_LENGTH = 254;
export const GcpServiceAccountKeyRotationSchema = z
  .object({
    type: z.literal(SecretRotation.GcpServiceAccountKey),
    parameters: z.object({
      serviceAccountEmail: z
        .string()
        .trim()
        .min(1, "Service Account Email required")
        .max(GCP_SERVICE_ACCOUNT_EMAIL_MAX_LENGTH)
        .email("Service Account Email must be a valid email address")
    }),
    secretsMapping: z.object({
      serviceAccountKey: z.string().trim().min(1, "Service Account Key secret name required")
    })
  })
  .merge(BaseSecretRotationSchema);
export const HpIloRotationSchema = z
  .object({
    type: z.literal(SecretRotation.HpIloLocalAccount),
    parameters: z.object({
      username: z.string().trim().min(1, "Username is required"),
      rotationMethod: z.nativeEnum(HpIloRotationMethod).optional(),
      passwordRequirements: PasswordRequirementsSchema.optional()
    }),
    secretsMapping: z.object({
      username: z.string().min(1, "Username mapping is required"),
      password: z.string().min(1, "Password mapping is required")
    }),
    temporaryParameters: z
      .object({
        password: z.string().optional()
      })
      .optional()
  })
  .merge(BaseSecretRotationSchema);
export type THpIloRotationForm = z.infer<typeof HpIloRotationSchema>;
const LITELLM_API_KEY_NAME_MAX_LENGTH = 100;
const LITELLM_RESERVED_KEY_OPTIONS = [
  "key_alias",
  "auto_rotate",
  "rotation_interval",
  "duration",
  "send_invite_email",
  "key_type",
  "user_id",
  "team_id",
  "models"
];
const LITELLM_FORBIDDEN_KEY_OPTIONS = ["allowed_routes", "permission", "object_permission"];
const LITELLM_ADDITIONAL_OPTIONS_MAX_KEYS = 55;
export const LiteLLMApiKeyRotationSchema = z
  .object({
    type: z.literal(SecretRotation.LiteLLMApiKey),
    parameters: z.object({
      name: z
        .string()
        .trim()
        .min(1, "Key name required")
        .max(
          LITELLM_API_KEY_NAME_MAX_LENGTH,
          `Key name must be ${LITELLM_API_KEY_NAME_MAX_LENGTH} characters or fewer`
        ),
      additionalOptions: z
        .string()
        .trim()
        .optional()
        .superRefine((val, ctx) => {
          if (!val) return;
          let parsed: unknown;
          try {
            parsed = JSON.parse(val);
          } catch {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Additional options must be valid JSON."
            });
            return;
          }
          if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Additional options must be a JSON object."
            });
            return;
          }
          const keys = Object.keys(parsed);
          if (keys.length > LITELLM_ADDITIONAL_OPTIONS_MAX_KEYS) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Additional options cannot contain more than ${LITELLM_ADDITIONAL_OPTIONS_MAX_KEYS} keys (received ${keys.length}).`
            });
            return;
          }
          const forbiddenKeys = keys.filter((key) => LITELLM_FORBIDDEN_KEY_OPTIONS.includes(key));
          if (forbiddenKeys.length) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `The following options are not allowed in additional options: ${forbiddenKeys.join(", ")}. They would grant key-management permissions that could modify other keys.`
            });
            return;
          }
          const reservedKeys = keys.filter((key) => LITELLM_RESERVED_KEY_OPTIONS.includes(key));
          if (reservedKeys.length) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `The following options are managed by Infisical and cannot be set: ${reservedKeys.join(", ")}.`
            });
          }
        }),
      userId: z.string().trim().optional(),
      teamId: z.string().trim().optional(),
      models: z.array(z.string().trim()).optional()
    }),
    secretsMapping: z.object({
      apiKey: z.string().trim().min(1, "API Key secret name required")
    })
  })
  .merge(BaseSecretRotationSchema);
export const OktaClientSecretRotationSchema = z
  .object({
    type: z.literal(SecretRotation.OktaClientSecret),
    parameters: z.object({
      clientId: z.string().trim().min(1, "App ID required")
    }),
    secretsMapping: z.object({
      clientId: z.string().trim().min(1, "Client ID required"),
      clientSecret: z.string().trim().min(1, "Client Secret required")
    })
  })
  .merge(BaseSecretRotationSchema);
const OPEN_ROUTER_API_KEY_NAME_MAX_LENGTH = 100;
export const OpenRouterApiKeyRotationSchema = z
  .object({
    type: z.literal(SecretRotation.OpenRouterApiKey),
    parameters: z.object({
      name: z
        .string()
        .trim()
        .min(1, "Key name required")
        .max(
          OPEN_ROUTER_API_KEY_NAME_MAX_LENGTH,
          `Key name must be ${OPEN_ROUTER_API_KEY_NAME_MAX_LENGTH} characters or fewer`
        ),
      workspaceId: z.string().trim().optional(),
      limit: z.number().positive().optional().nullable(),
      limitReset: z.nativeEnum(OpenRouterLimitReset).optional().nullable(),
      includeByokInLimit: z.boolean().optional().nullable()
    }),
    secretsMapping: z.object({
      apiKey: z.string().trim().min(1, "API Key secret name required")
    })
  })
  .merge(BaseSecretRotationSchema);
export const OPENAI_SERVICE_ACCOUNT_NAME_MAX_LENGTH = 100;
export const OpenAIServiceAccountRotationSchema = z
  .object({
    type: z.literal(SecretRotation.OpenAIServiceAccount),
    parameters: z.object({
      projectId: z.string().trim().min(1, "Project required"),
      name: z
        .string()
        .trim()
        .min(1, "Service account name required")
        .max(
          OPENAI_SERVICE_ACCOUNT_NAME_MAX_LENGTH,
          `Service account name must be ${OPENAI_SERVICE_ACCOUNT_NAME_MAX_LENGTH} characters or fewer`
        )
    }),
    secretsMapping: z.object({
      apiKey: z.string().trim().min(1, "API Key secret name required")
    })
  })
  .merge(BaseSecretRotationSchema);
export const OracleDBCredentialsRotationSchema = z
  .object({
    type: z.literal(SecretRotation.OracleDBCredentials)
  })
  .merge(SqlCredentialsRotationSchema)
  .merge(BaseSecretRotationSchema);
export const RedisCredentialsRotationSchema = z
  .object({
    type: z.literal(SecretRotation.RedisCredentials),
    parameters: z.object({
      passwordRequirements: PasswordRequirementsSchema.optional(),
      permissionScope: z.string().trim().min(1, "Permission scope is required")
    }),
    secretsMapping: z.object({
      username: z.string().trim().min(1, "Username required"),
      password: z.string().trim().min(1, "Password required")
    })
  })
  .merge(BaseSecretRotationSchema);
export const SalesforceOauthCredentialsRotationSchema = z
  .object({
    type: z.literal(SecretRotation.SalesforceOauthCredentials),
    parameters: z.object({
      appId: z.string().trim().min(1, "App required"),
      appName: z.string().trim().min(1, "App required")
    }),
    secretsMapping: z.object({
      consumerKey: z.string().trim().min(1, "Consumer Key required"),
      consumerSecret: z.string().trim().min(1, "Consumer Secret required")
    })
  })
  .merge(BaseSecretRotationSchema);
export const SnowflakeUserKeyPairRotationSchema = z
  .object({
    type: z.literal(SecretRotation.SnowflakeUserKeyPair),
    parameters: z.object({
      username: z.string().trim().min(1, "User required"),
      modulusLength: z.union([z.literal(2048), z.literal(4096)])
    }),
    secretsMapping: z.object({
      privateKey: z.string().trim().min(1, "Private Key required"),
      publicKey: z.string().trim().min(1, "Public Key required")
    })
  })
  .merge(BaseSecretRotationSchema);
export const StripeApiKeyRotationSchema = z
  .object({
    type: z.literal(SecretRotation.StripeApiKey),
    parameters: z.object({
      permissions: z.string().trim().array().min(1, "Grant at least one permission"),
      keyName: z
        .string()
        .trim()
        .max(80, "Key name must be 80 characters or fewer")
        .optional()
        .transform((keyName) => keyName || undefined)
    }),
    secretsMapping: z.object({
      apiKey: z.string().trim().min(1, "API Key secret name required")
    })
  })
  .merge(BaseSecretRotationSchema);
export const SupabaseApiKeyRotationSchema = z
  .object({
    type: z.literal(SecretRotation.SupabaseApiKey),
    parameters: z.object({
      projectRef: z.string().trim().min(1, "Project reference required"),
      keyType: z.nativeEnum(SupabaseApiKeyType)
    }),
    secretsMapping: z.object({
      apiKey: z.string().trim().min(1, "API Key secret name required")
    })
  })
  .merge(BaseSecretRotationSchema);
export const UnixLinuxLocalAccountRotationSchema = z
  .object({
    type: z.literal(SecretRotation.UnixLinuxLocalAccount),
    parameters: z.object({
      username: z.string().trim().min(1, "Username required"),
      passwordRequirements: PasswordRequirementsSchema.optional(),
      rotationMethod: z.nativeEnum(UnixLinuxLocalAccountRotationMethod).optional(),
      useSudo: z.boolean().default(false).optional()
    }),
    secretsMapping: z.object({
      username: z.string().trim().min(1, "Username required"),
      password: z.string().trim().min(1, "Password required")
    }),
    temporaryParameters: z
      .object({
        password: z.string().optional()
      })
      .optional()
  })
  .merge(BaseSecretRotationSchema);
const WINDOWS_PRIVILEGED_ACCOUNTS = ["administrator", "system", "guest", "defaultaccount"];
const WindowsPasswordRequirementsSchema = PasswordRequirementsSchema.refine(
  (data) => {
    if (!data.allowedSymbols) return true;
    return !containsDangerousSmbChars(data.allowedSymbols);
  },
  {
    message: "Allowed symbols cannot contain: semicolons, spaces, quotes, or pipes",
    path: ["allowedSymbols"]
  }
);
export const WindowsLocalAccountRotationSchema = z
  .object({
    type: z.literal(SecretRotation.WindowsLocalAccount),
    parameters: z.object({
      username: z
        .string()
        .trim()
        .min(1, "Username required")
        .max(
          SMB_VALIDATION_LIMITS.MAX_WINDOWS_USERNAME_LENGTH,
          "Username too long - Windows local accounts are limited to 20 characters"
        )
        .refine((val) => SMB_USERNAME_REGEX.test(val), {
          message:
            "Username can only contain alphanumeric characters, underscores, hyphens, and periods"
        })
        .refine((val) => !val.startsWith("-") && !val.startsWith(".") && !val.endsWith("."), {
          message: "Username cannot start with a hyphen or period, and cannot end with a period"
        })
        .refine((val) => !WINDOWS_PRIVILEGED_ACCOUNTS.includes(val.toLowerCase()), {
          message:
            "Cannot rotate passwords for privileged system accounts (Administrator, SYSTEM, Guest, DefaultAccount)"
        }),
      passwordRequirements: WindowsPasswordRequirementsSchema.optional(),
      rotationMethod: z.nativeEnum(WindowsLocalAccountRotationMethod).optional()
    }),
    secretsMapping: z.object({
      username: z.string().trim().min(1, "Username required"),
      password: z.string().trim().min(1, "Password required")
    }),
    temporaryParameters: z
      .object({
        password: z
          .string()
          .refine((val) => !val || validateSmbPassword(val), {
            message: "Password cannot contain: semicolons, spaces, quotes, or pipes"
          })
          .optional()
      })
      .optional()
  })
  .merge(BaseSecretRotationSchema);
export const SecretRotationV2FormSchema = (isUpdate: boolean) =>
  z
    .intersection(
      z.discriminatedUnion("type", [
        Auth0ClientSecretRotationSchema,
        AzureClientSecretRotationSchema,
        PostgresCredentialsRotationSchema,
        MsSqlCredentialsRotationSchema,
        MySqlCredentialsRotationSchema,
        OracleDBCredentialsRotationSchema,
        LdapPasswordRotationSchema,
        AwsIamUserSecretRotationSchema,
        OktaClientSecretRotationSchema,
        RedisCredentialsRotationSchema,
        MongoDBCredentialsRotationSchema,
        DatabricksServicePrincipalSecretRotationSchema,
        UnixLinuxLocalAccountRotationSchema,
        DbtServiceTokenRotationSchema,
        WindowsLocalAccountRotationSchema,
        OpenRouterApiKeyRotationSchema,
        LiteLLMApiKeyRotationSchema,
        OpenAIServiceAccountRotationSchema,
        HpIloRotationSchema,
        SupabaseApiKeyRotationSchema,
        SalesforceOauthCredentialsRotationSchema,
        DatadogApplicationKeySecretRotationSchema,
        DatadogApiKeyRotationSchema,
        ConvexAccessKeyRotationSchema,
        FireworksApiKeyRotationSchema,
        SnowflakeUserKeyPairRotationSchema,
        CloudflareApiTokenRotationSchema,
        CloudflareR2AccessKeyRotationSchema,
        StripeApiKeyRotationSchema,
        GcpServiceAccountKeyRotationSchema
      ]),
      z.object({ id: z.string().optional() })
    )
    .superRefine((val, ctx) => {
      if (isUpdate) return;
      if (val.type === SecretRotation.LdapPassword) {
        if (
          val.parameters.rotationMethod === LdapPasswordRotationMethod.TargetPrincipal &&
          !val.temporaryParameters?.password
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Password required",
            path: ["temporaryParameters", "password"]
          });
        }
      }
      if (val.type === SecretRotation.UnixLinuxLocalAccount) {
        if (
          val.parameters.rotationMethod === UnixLinuxLocalAccountRotationMethod.LoginAsTarget &&
          !val.temporaryParameters?.password
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Password required",
            path: ["temporaryParameters", "password"]
          });
        }
      }
      if (val.type === SecretRotation.WindowsLocalAccount) {
        if (
          val.parameters.rotationMethod === WindowsLocalAccountRotationMethod.LoginAsTarget &&
          !val.temporaryParameters?.password
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Password required",
            path: ["temporaryParameters", "password"]
          });
        }
      }
      if (val.type === SecretRotation.HpIloLocalAccount) {
        if (
          val.parameters.rotationMethod === HpIloRotationMethod.LoginAsTarget &&
          !val.temporaryParameters?.password
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Password required",
            path: ["temporaryParameters", "password"]
          });
        }
      }
    });
export type TSecretRotationV2Form = z.infer<ReturnType<typeof SecretRotationV2FormSchema>>;
export const SECRET_ROTATION_MAP: Record<
  SecretRotation,
  {
    name: string;
    image: string;
    size: number;
  }
> = {
  [SecretRotation.PostgresCredentials]: {
    name: "PostgreSQL Credentials",
    image: "Postgres.png",
    size: 45
  },
  [SecretRotation.MsSqlCredentials]: {
    name: "Microsoft SQL Server Credentials",
    image: "MsSql.png",
    size: 50
  },
  [SecretRotation.MySqlCredentials]: {
    name: "MySQL Credentials",
    image: "MySql.png",
    size: 50
  },
  [SecretRotation.OracleDBCredentials]: {
    name: "OracleDB Credentials",
    image: "Oracle.png",
    size: 50
  },
  [SecretRotation.Auth0ClientSecret]: {
    name: "Auth0 Client Secret",
    image: "Auth0.png",
    size: 35
  },
  [SecretRotation.AzureClientSecret]: {
    name: "Azure Client Secret",
    image: "Microsoft Azure.png",
    size: 65
  },
  [SecretRotation.LdapPassword]: {
    name: "LDAP Password",
    image: "LDAP.png",
    size: 65
  },
  [SecretRotation.AwsIamUserSecret]: {
    name: "AWS IAM User Secret",
    image: "Amazon Web Services.png",
    size: 50
  },
  [SecretRotation.OktaClientSecret]: {
    name: "Okta Client Secret",
    image: "Okta.png",
    size: 50
  },
  [SecretRotation.RedisCredentials]: {
    name: "Redis Credentials",
    image: "Redis.png",
    size: 50
  },
  [SecretRotation.MongoDBCredentials]: {
    name: "MongoDB Credentials",
    image: "MongoDB.png",
    size: 50
  },
  [SecretRotation.DatabricksServicePrincipalSecret]: {
    name: "Databricks Service Principal",
    image: "Databricks.png",
    size: 50
  },
  [SecretRotation.UnixLinuxLocalAccount]: {
    name: "Unix/Linux Local Account",
    image: "SSH.png",
    size: 50
  },
  [SecretRotation.DbtServiceToken]: {
    name: "DBT Service Token",
    image: "DBT.png",
    size: 50
  },
  [SecretRotation.WindowsLocalAccount]: {
    name: "Windows Local Account",
    image: "Windows.png",
    size: 50
  },
  [SecretRotation.OpenRouterApiKey]: {
    name: "OpenRouter API Key",
    image: "OpenRouter.png",
    size: 50
  },
  [SecretRotation.LiteLLMApiKey]: {
    name: "LiteLLM API Key",
    image: "LiteLLM.png",
    size: 50
  },
  [SecretRotation.OpenAIServiceAccount]: {
    name: "OpenAI Service Account",
    image: "OpenAI.png",
    size: 50
  },
  [SecretRotation.HpIloLocalAccount]: {
    name: "HP iLO Local Account",
    image: "SSH.png",
    size: 50
  },
  [SecretRotation.SupabaseApiKey]: {
    name: "Supabase API Key",
    image: "Supabase.png",
    size: 50
  },
  [SecretRotation.SalesforceOauthCredentials]: {
    name: "Salesforce OAuth Credentials",
    image: "Salesforce.png",
    size: 50
  },
  [SecretRotation.DatadogApplicationKeySecret]: {
    name: "Datadog Application Key",
    image: "DatadogWhite.png",
    size: 50
  },
  [SecretRotation.DatadogApiKey]: {
    name: "Datadog API Key",
    image: "DatadogWhite.png",
    size: 50
  },
  [SecretRotation.ConvexAccessKey]: {
    name: "Convex Access Key",
    image: "Convex.png",
    size: 50
  },
  [SecretRotation.FireworksApiKey]: {
    name: "Fireworks Secret",
    image: "Fireworks.png",
    size: 50
  },
  [SecretRotation.SnowflakeUserKeyPair]: {
    name: "Snowflake User Key Pair",
    image: "Snowflake.png",
    size: 50
  },
  [SecretRotation.CloudflareApiToken]: {
    name: "Cloudflare API Token",
    image: "Cloudflare.png",
    size: 50
  },
  [SecretRotation.CloudflareR2AccessKey]: {
    name: "Cloudflare R2 Access Key",
    image: "Cloudflare.png",
    size: 50
  },
  [SecretRotation.StripeApiKey]: {
    name: "Stripe API Key",
    image: "Stripe.svg",
    size: 50
  },
  [SecretRotation.GcpServiceAccountKey]: {
    name: "GCP Service Account Key",
    image: "Google Cloud Platform.png",
    size: 50
  }
};
export const SECRET_ROTATION_CONNECTION_MAP: Record<SecretRotation, AppConnection> = {
  [SecretRotation.PostgresCredentials]: AppConnection.Postgres,
  [SecretRotation.MsSqlCredentials]: AppConnection.MsSql,
  [SecretRotation.MySqlCredentials]: AppConnection.MySql,
  [SecretRotation.OracleDBCredentials]: AppConnection.OracleDB,
  [SecretRotation.Auth0ClientSecret]: AppConnection.Auth0,
  [SecretRotation.AzureClientSecret]: AppConnection.AzureClientSecrets,
  [SecretRotation.LdapPassword]: AppConnection.LDAP,
  [SecretRotation.AwsIamUserSecret]: AppConnection.AWS,
  [SecretRotation.OktaClientSecret]: AppConnection.Okta,
  [SecretRotation.RedisCredentials]: AppConnection.Redis,
  [SecretRotation.MongoDBCredentials]: AppConnection.MongoDB,
  [SecretRotation.DatabricksServicePrincipalSecret]: AppConnection.Databricks,
  [SecretRotation.UnixLinuxLocalAccount]: AppConnection.SSH,
  [SecretRotation.DbtServiceToken]: AppConnection.Dbt,
  [SecretRotation.WindowsLocalAccount]: AppConnection.SMB,
  [SecretRotation.OpenRouterApiKey]: AppConnection.OpenRouter,
  [SecretRotation.LiteLLMApiKey]: AppConnection.LiteLLM,
  [SecretRotation.OpenAIServiceAccount]: AppConnection.OpenAI,
  [SecretRotation.HpIloLocalAccount]: AppConnection.SSH,
  [SecretRotation.SupabaseApiKey]: AppConnection.Supabase,
  [SecretRotation.SalesforceOauthCredentials]: AppConnection.Salesforce,
  [SecretRotation.DatadogApplicationKeySecret]: AppConnection.Datadog,
  [SecretRotation.DatadogApiKey]: AppConnection.Datadog,
  [SecretRotation.ConvexAccessKey]: AppConnection.Convex,
  [SecretRotation.FireworksApiKey]: AppConnection.Fireworks,
  [SecretRotation.SnowflakeUserKeyPair]: AppConnection.Snowflake,
  [SecretRotation.CloudflareApiToken]: AppConnection.Cloudflare,
  [SecretRotation.CloudflareR2AccessKey]: AppConnection.Cloudflare,
  [SecretRotation.StripeApiKey]: AppConnection.Stripe,
  [SecretRotation.GcpServiceAccountKey]: AppConnection.GCP
};
const SECRET_ROTATION_ADDITIONAL_CONNECTION_MAP: Partial<Record<SecretRotation, AppConnection[]>> =
  {
    [SecretRotation.HpIloLocalAccount]: [AppConnection.HpeIloRedFish]
  };
export const getSecretRotationConnectionApps = (type: SecretRotation): AppConnection[] => [
  SECRET_ROTATION_CONNECTION_MAP[type],
  ...(SECRET_ROTATION_ADDITIONAL_CONNECTION_MAP[type] ?? [])
];
export const IS_ROTATION_DUAL_CREDENTIALS: Record<SecretRotation, boolean> = {
  [SecretRotation.PostgresCredentials]: true,
  [SecretRotation.MsSqlCredentials]: true,
  [SecretRotation.MySqlCredentials]: true,
  [SecretRotation.OracleDBCredentials]: true,
  [SecretRotation.Auth0ClientSecret]: false,
  [SecretRotation.AzureClientSecret]: true,
  [SecretRotation.LdapPassword]: false,
  [SecretRotation.AwsIamUserSecret]: true,
  [SecretRotation.OktaClientSecret]: true,
  [SecretRotation.RedisCredentials]: true,
  [SecretRotation.MongoDBCredentials]: true,
  [SecretRotation.DatabricksServicePrincipalSecret]: true,
  [SecretRotation.UnixLinuxLocalAccount]: false,
  [SecretRotation.DbtServiceToken]: true,
  [SecretRotation.WindowsLocalAccount]: false,
  [SecretRotation.OpenRouterApiKey]: true,
  [SecretRotation.LiteLLMApiKey]: true,
  [SecretRotation.OpenAIServiceAccount]: true,
  [SecretRotation.HpIloLocalAccount]: false,
  [SecretRotation.SupabaseApiKey]: true,
  [SecretRotation.SalesforceOauthCredentials]: true,
  [SecretRotation.DatadogApplicationKeySecret]: true,
  [SecretRotation.DatadogApiKey]: true,
  [SecretRotation.ConvexAccessKey]: true,
  [SecretRotation.FireworksApiKey]: true,
  [SecretRotation.SnowflakeUserKeyPair]: true,
  [SecretRotation.CloudflareApiToken]: true,
  [SecretRotation.CloudflareR2AccessKey]: true,
  [SecretRotation.StripeApiKey]: true,
  [SecretRotation.GcpServiceAccountKey]: true
};
