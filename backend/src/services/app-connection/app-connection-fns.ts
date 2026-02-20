import { ProjectType } from "@app/db/schemas";
import { TAppConnections } from "@app/db/schemas/app-connections";
import {
  ChefConnectionMethod,
  getChefConnectionListItem,
  validateChefConnectionCredentials
} from "@app/ee/services/app-connections/chef";
import {
  getOCIConnectionListItem,
  OCIConnectionMethod,
  validateOCIConnectionCredentials
} from "@app/ee/services/app-connections/oci";
import { getOracleDBConnectionListItem, OracleDBConnectionMethod } from "@app/ee/services/app-connections/oracledb";
import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { SECRET_ROTATION_CONNECTION_MAP } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-maps";
import { SECRET_SCANNING_DATA_SOURCE_CONNECTION_MAP } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-maps";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import { APP_CONNECTION_NAME_MAP, APP_CONNECTION_PLAN_MAP } from "@app/services/app-connection/app-connection-maps";
import {
  transferSqlConnectionCredentialsToPlatform,
  validateSqlConnectionCredentials
} from "@app/services/app-connection/shared/sql";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { SECRET_SYNC_CONNECTION_MAP } from "@app/services/secret-sync/secret-sync-maps";

import {
  getOnePassConnectionListItem,
  OnePassConnectionMethod,
  validateOnePassConnectionCredentials
} from "./1password";
import { AppConnection, AppConnectionPlanType } from "./app-connection-enums";
import { TAppConnectionServiceFactoryDep } from "./app-connection-service";
import {
  TAppConnection,
  TAppConnectionConfig,
  TAppConnectionCredentialsValidator,
  TAppConnectionTransitionCredentialsToPlatform
} from "./app-connection-types";
import { Auth0ConnectionMethod, getAuth0ConnectionListItem, validateAuth0ConnectionCredentials } from "./auth0";
import { AwsConnectionMethod, getAwsConnectionListItem, validateAwsConnectionCredentials } from "./aws";
import { AzureADCSConnectionMethod } from "./azure-adcs";
import {
  getAzureADCSConnectionListItem,
  validateAzureADCSConnectionCredentials
} from "./azure-adcs/azure-adcs-connection-fns";
import {
  AzureAppConfigurationConnectionMethod,
  getAzureAppConfigurationConnectionListItem,
  validateAzureAppConfigurationConnectionCredentials
} from "./azure-app-configuration";
import {
  AzureClientSecretsConnectionMethod,
  getAzureClientSecretsConnectionListItem,
  validateAzureClientSecretsConnectionCredentials
} from "./azure-client-secrets";
import { AzureDevOpsConnectionMethod } from "./azure-devops/azure-devops-enums";
import {
  getAzureDevopsConnectionListItem,
  validateAzureDevOpsConnectionCredentials
} from "./azure-devops/azure-devops-fns";
import {
  AzureKeyVaultConnectionMethod,
  getAzureKeyVaultConnectionListItem,
  validateAzureKeyVaultConnectionCredentials
} from "./azure-key-vault";
import {
  BitbucketConnectionMethod,
  getBitbucketConnectionListItem,
  validateBitbucketConnectionCredentials
} from "./bitbucket";
import { CamundaConnectionMethod, getCamundaConnectionListItem, validateCamundaConnectionCredentials } from "./camunda";
import { ChecklyConnectionMethod, getChecklyConnectionListItem, validateChecklyConnectionCredentials } from "./checkly";
import {
  CircleCIConnectionMethod,
  getCircleCIConnectionListItem,
  validateCircleCIConnectionCredentials
} from "./circleci";
import { CloudflareConnectionMethod } from "./cloudflare/cloudflare-connection-enum";
import {
  getCloudflareConnectionListItem,
  validateCloudflareConnectionCredentials
} from "./cloudflare/cloudflare-connection-fns";
import {
  DatabricksConnectionMethod,
  getDatabricksConnectionListItem,
  validateDatabricksConnectionCredentials
} from "./databricks";
import { DbtConnectionMethod, getDbtConnectionListItem, validateDbtConnectionCredentials } from "./dbt";
import {
  DigitalOceanConnectionMethod,
  getDigitalOceanConnectionListItem,
  validateDigitalOceanConnectionCredentials
} from "./digital-ocean";
import { DNSMadeEasyConnectionMethod } from "./dns-made-easy/dns-made-easy-connection-enum";
import {
  getDNSMadeEasyConnectionListItem,
  validateDNSMadeEasyConnectionCredentials
} from "./dns-made-easy/dns-made-easy-connection-fns";
import { FlyioConnectionMethod, getFlyioConnectionListItem, validateFlyioConnectionCredentials } from "./flyio";
import { GcpConnectionMethod, getGcpConnectionListItem, validateGcpConnectionCredentials } from "./gcp";
import { getGitHubConnectionListItem, GitHubConnectionMethod, validateGitHubConnectionCredentials } from "./github";
import {
  getGitHubRadarConnectionListItem,
  GitHubRadarConnectionMethod,
  validateGitHubRadarConnectionCredentials
} from "./github-radar";
import { getGitLabConnectionListItem, GitLabConnectionMethod, validateGitLabConnectionCredentials } from "./gitlab";
import {
  getHCVaultConnectionListItem,
  HCVaultConnectionMethod,
  validateHCVaultConnectionCredentials
} from "./hc-vault";
import { getHerokuConnectionListItem, HerokuConnectionMethod, validateHerokuConnectionCredentials } from "./heroku";
import {
  getHumanitecConnectionListItem,
  HumanitecConnectionMethod,
  validateHumanitecConnectionCredentials
} from "./humanitec";
import {
  getLaravelForgeConnectionListItem,
  LaravelForgeConnectionMethod,
  validateLaravelForgeConnectionCredentials
} from "./laravel-forge";
import { getLdapConnectionListItem, LdapConnectionMethod, validateLdapConnectionCredentials } from "./ldap";
import { getMongoDBConnectionListItem, MongoDBConnectionMethod, validateMongoDBConnectionCredentials } from "./mongodb";
import { getMsSqlConnectionListItem, MsSqlConnectionMethod } from "./mssql";
import { MySqlConnectionMethod } from "./mysql/mysql-connection-enums";
import { getMySqlConnectionListItem } from "./mysql/mysql-connection-fns";
import { getNetlifyConnectionListItem, validateNetlifyConnectionCredentials } from "./netlify";
import {
  getNorthflankConnectionListItem,
  NorthflankConnectionMethod,
  validateNorthflankConnectionCredentials
} from "./northflank";
import {
  getOctopusDeployConnectionListItem,
  OctopusDeployConnectionMethod,
  validateOctopusDeployConnectionCredentials
} from "./octopus-deploy";
import { getOktaConnectionListItem, OktaConnectionMethod, validateOktaConnectionCredentials } from "./okta";
import {
  getOpenRouterConnectionListItem,
  OpenRouterConnectionMethod,
  validateOpenRouterConnectionCredentials
} from "./open-router";
import { getPostgresConnectionListItem, PostgresConnectionMethod } from "./postgres";
import { getRailwayConnectionListItem, validateRailwayConnectionCredentials } from "./railway";
import { getRedisConnectionListItem, RedisConnectionMethod, validateRedisConnectionCredentials } from "./redis";
import { RenderConnectionMethod } from "./render/render-connection-enums";
import { getRenderConnectionListItem, validateRenderConnectionCredentials } from "./render/render-connection-fns";
import { getSmbConnectionListItem, SmbConnectionMethod, validateSmbConnectionCredentials } from "./smb";
import { getSshConnectionListItem, SshConnectionMethod, validateSshConnectionCredentials } from "./ssh";
import {
  getSupabaseConnectionListItem,
  SupabaseConnectionMethod,
  validateSupabaseConnectionCredentials
} from "./supabase";
import {
  getTeamCityConnectionListItem,
  TeamCityConnectionMethod,
  validateTeamCityConnectionCredentials
} from "./teamcity";
import {
  getTerraformCloudConnectionListItem,
  TerraformCloudConnectionMethod,
  validateTerraformCloudConnectionCredentials
} from "./terraform-cloud";
import { VercelConnectionMethod } from "./vercel";
import { getVercelConnectionListItem, validateVercelConnectionCredentials } from "./vercel/vercel-connection-fns";
import {
  getWindmillConnectionListItem,
  validateWindmillConnectionCredentials,
  WindmillConnectionMethod
} from "./windmill";
import { getZabbixConnectionListItem, validateZabbixConnectionCredentials, ZabbixConnectionMethod } from "./zabbix";
import {
  AlibabaCloudConnectionMethod,
  getAlibabaCloudConnectionListItem,
  validateAlibabaCloudConnectionCredentials
} from "./alibaba-cloud";

const SECRET_SYNC_APP_CONNECTION_MAP = Object.fromEntries(
  Object.entries(SECRET_SYNC_CONNECTION_MAP).map(([key, value]) => [value, key])
);

const SECRET_ROTATION_APP_CONNECTION_MAP = Object.fromEntries(
  Object.entries(SECRET_ROTATION_CONNECTION_MAP).map(([key, value]) => [value, key])
);

const SECRET_SCANNING_APP_CONNECTION_MAP = Object.fromEntries(
  Object.entries(SECRET_SCANNING_DATA_SOURCE_CONNECTION_MAP).map(([key, value]) => [value, key])
);

// scott: ideally this would be derived from a utilized map like the above
const PKI_APP_CONNECTIONS = [
  AppConnection.AWS,
  AppConnection.Cloudflare,
  AppConnection.AzureADCS,
  AppConnection.AzureKeyVault,
  AppConnection.Chef,
  AppConnection.DNSMadeEasy
];

export const listAppConnectionOptions = (projectType?: ProjectType) => {
  return [
    getAwsConnectionListItem(),
    getGitHubConnectionListItem(),
    getGitHubRadarConnectionListItem(),
    getGcpConnectionListItem(),
    getAzureKeyVaultConnectionListItem(),
    getAzureAppConfigurationConnectionListItem(),
    getAzureDevopsConnectionListItem(),
    getAzureADCSConnectionListItem(),
    getDatabricksConnectionListItem(),
    getHumanitecConnectionListItem(),
    getTerraformCloudConnectionListItem(),
    getVercelConnectionListItem(),
    getPostgresConnectionListItem(),
    getMsSqlConnectionListItem(),
    getMySqlConnectionListItem(),
    getCamundaConnectionListItem(),
    getAzureClientSecretsConnectionListItem(),
    getWindmillConnectionListItem(),
    getAuth0ConnectionListItem(),
    getHCVaultConnectionListItem(),
    getLdapConnectionListItem(),
    getTeamCityConnectionListItem(),
    getOCIConnectionListItem(),
    getOracleDBConnectionListItem(),
    getOnePassConnectionListItem(),
    getHerokuConnectionListItem(),
    getRenderConnectionListItem(),
    getLaravelForgeConnectionListItem(),
    getOctopusDeployConnectionListItem(),
    getFlyioConnectionListItem(),
    getGitLabConnectionListItem(),
    getCloudflareConnectionListItem(),
    getDNSMadeEasyConnectionListItem(),
    getZabbixConnectionListItem(),
    getRailwayConnectionListItem(),
    getBitbucketConnectionListItem(),
    getChecklyConnectionListItem(),
    getSupabaseConnectionListItem(),
    getDigitalOceanConnectionListItem(),
    getNetlifyConnectionListItem(),
    getNorthflankConnectionListItem(),
    getOktaConnectionListItem(),
    getRedisConnectionListItem(),
    getMongoDBConnectionListItem(),
    getChefConnectionListItem(),
    getSshConnectionListItem(),
    getDbtConnectionListItem(),
    getSmbConnectionListItem(),
    getOpenRouterConnectionListItem(),
    getCircleCIConnectionListItem(),
    getAlibabaCloudConnectionListItem()
  ]
    .filter((option) => {
      switch (projectType) {
        case ProjectType.SecretManager:
          return (
            Boolean(SECRET_SYNC_APP_CONNECTION_MAP[option.app]) ||
            Boolean(SECRET_ROTATION_APP_CONNECTION_MAP[option.app])
          );
        case ProjectType.SecretScanning:
          return Boolean(SECRET_SCANNING_APP_CONNECTION_MAP[option.app]);
        case ProjectType.CertificateManager:
          return PKI_APP_CONNECTIONS.includes(option.app);
        case ProjectType.KMS:
          return false;
        case ProjectType.SSH:
          return false;
        case ProjectType.PAM:
          return false;
        default:
          return true;
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const encryptAppConnectionCredentials = async ({
  orgId,
  credentials,
  kmsService,
  projectId
}: {
  orgId: string;
  credentials: TAppConnection["credentials"];
  kmsService: TAppConnectionServiceFactoryDep["kmsService"];
  projectId: string | null | undefined;
}) => {
  const { encryptor } = await kmsService.createCipherPairWithDataKey(
    projectId
      ? {
          type: KmsDataKey.SecretManager,
          projectId
        }
      : {
          type: KmsDataKey.Organization,
          orgId
        }
  );

  const { cipherTextBlob: encryptedCredentialsBlob } = encryptor({
    plainText: Buffer.from(JSON.stringify(credentials))
  });

  return encryptedCredentialsBlob;
};

export const decryptAppConnectionCredentials = async ({
  orgId,
  encryptedCredentials,
  kmsService,
  projectId
}: {
  orgId: string;
  encryptedCredentials: Buffer;
  kmsService: TAppConnectionServiceFactoryDep["kmsService"];
  projectId: string | null | undefined;
}) => {
  const { decryptor } = await kmsService.createCipherPairWithDataKey(
    projectId
      ? { type: KmsDataKey.SecretManager, projectId }
      : {
          type: KmsDataKey.Organization,
          orgId
        }
  );

  const decryptedPlainTextBlob = decryptor({
    cipherTextBlob: encryptedCredentials
  });

  return JSON.parse(decryptedPlainTextBlob.toString()) as TAppConnection["credentials"];
};

export const validateAppConnectionCredentials = async (
  appConnection: TAppConnectionConfig,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
): Promise<TAppConnection["credentials"]> => {
  const VALIDATE_APP_CONNECTION_CREDENTIALS_MAP: Record<AppConnection, TAppConnectionCredentialsValidator> = {
    [AppConnection.AWS]: validateAwsConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.Databricks]: validateDatabricksConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.GitHub]: validateGitHubConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.GitHubRadar]: validateGitHubRadarConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.GCP]: validateGcpConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.AzureKeyVault]: validateAzureKeyVaultConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.AzureAppConfiguration]:
      validateAzureAppConfigurationConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.AzureClientSecrets]:
      validateAzureClientSecretsConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.AzureDevOps]: validateAzureDevOpsConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.AzureADCS]: validateAzureADCSConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.Humanitec]: validateHumanitecConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.Postgres]: validateSqlConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.MsSql]: validateSqlConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.MySql]: validateSqlConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.Camunda]: validateCamundaConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.Vercel]: validateVercelConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.TerraformCloud]: validateTerraformCloudConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.Auth0]: validateAuth0ConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.Windmill]: validateWindmillConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.HCVault]: validateHCVaultConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.LDAP]: validateLdapConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.TeamCity]: validateTeamCityConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.OCI]: validateOCIConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.OracleDB]: validateSqlConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.OnePass]: validateOnePassConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.Heroku]: validateHerokuConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.Render]: validateRenderConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.LaravelForge]: validateLaravelForgeConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.Flyio]: validateFlyioConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.GitLab]: validateGitLabConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.Cloudflare]: validateCloudflareConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.DNSMadeEasy]: validateDNSMadeEasyConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.Zabbix]: validateZabbixConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.Railway]: validateRailwayConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.Bitbucket]: validateBitbucketConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.Checkly]: validateChecklyConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.Supabase]: validateSupabaseConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.DigitalOcean]: validateDigitalOceanConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.Netlify]: validateNetlifyConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.Northflank]: validateNorthflankConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.Okta]: validateOktaConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.Chef]: validateChefConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.Redis]: validateRedisConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.MongoDB]: validateMongoDBConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.OctopusDeploy]: validateOctopusDeployConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.SSH]: validateSshConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.Dbt]: validateDbtConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.SMB]: validateSmbConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.OpenRouter]: validateOpenRouterConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.CircleCI]: validateCircleCIConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.AlibabaCloud]: validateAlibabaCloudConnectionCredentials as TAppConnectionCredentialsValidator
  };

  return VALIDATE_APP_CONNECTION_CREDENTIALS_MAP[appConnection.app](appConnection, gatewayService, gatewayV2Service);
};

export const getAppConnectionMethodName = (method: TAppConnection["method"]) => {
  switch (method) {
    case GitHubConnectionMethod.App:
    case GitHubRadarConnectionMethod.App:
      return "GitHub App";
    case GitHubConnectionMethod.Pat:
      return "Personal Access Token";
    case AzureKeyVaultConnectionMethod.OAuth:
    case AzureAppConfigurationConnectionMethod.OAuth:
    case AzureClientSecretsConnectionMethod.OAuth:
    case GitHubConnectionMethod.OAuth:
    case AzureDevOpsConnectionMethod.OAuth:
    case HerokuConnectionMethod.OAuth:
    case GitLabConnectionMethod.OAuth:
      return "OAuth";
    case HerokuConnectionMethod.AuthToken:
      return "Auth Token";
    case AwsConnectionMethod.AccessKey:
    case OCIConnectionMethod.AccessKey:
      return "Access Key";
    case AwsConnectionMethod.AssumeRole:
      return "Assume Role";
    case GcpConnectionMethod.ServiceAccountImpersonation:
      return "Service Account Impersonation";
    case DatabricksConnectionMethod.ServicePrincipal:
      return "Service Principal";
    case CamundaConnectionMethod.ClientCredentials:
      return "Client Credentials";
    case HumanitecConnectionMethod.ApiToken:
    case TerraformCloudConnectionMethod.ApiToken:
    case VercelConnectionMethod.ApiToken:
    case OnePassConnectionMethod.ApiToken:
    case CloudflareConnectionMethod.APIToken:
    case BitbucketConnectionMethod.ApiToken:
    case ZabbixConnectionMethod.ApiToken:
    case DigitalOceanConnectionMethod.ApiToken:
    case NorthflankConnectionMethod.ApiToken:
    case OktaConnectionMethod.ApiToken:
    case LaravelForgeConnectionMethod.ApiToken:
    case DbtConnectionMethod.ApiToken:
    case CircleCIConnectionMethod.ApiToken:
      return "API Token";
    case DNSMadeEasyConnectionMethod.APIKeySecret:
      return "API Key & Secret";
    case PostgresConnectionMethod.UsernameAndPassword:
    case MsSqlConnectionMethod.UsernameAndPassword:
    case MySqlConnectionMethod.UsernameAndPassword:
    case OracleDBConnectionMethod.UsernameAndPassword:
    case AzureADCSConnectionMethod.UsernamePassword:
    case RedisConnectionMethod.UsernameAndPassword:
    case MongoDBConnectionMethod.UsernameAndPassword:
      return "Username & Password";
    case WindmillConnectionMethod.AccessToken:
    case HCVaultConnectionMethod.AccessToken:
    case TeamCityConnectionMethod.AccessToken:
    case AzureDevOpsConnectionMethod.AccessToken:
    case FlyioConnectionMethod.AccessToken:
      return "Access Token";
    case Auth0ConnectionMethod.ClientCredentials:
      return "Client Credentials";
    case HCVaultConnectionMethod.AppRole:
      return "App Role";
    case LdapConnectionMethod.SimpleBind:
      return "Simple Bind";
    case SshConnectionMethod.Password:
      return "Password";
    case SshConnectionMethod.SshKey:
      return "SSH Key";
    case SmbConnectionMethod.Credentials:
      return "Credentials";
    case RenderConnectionMethod.ApiKey:
    case ChecklyConnectionMethod.ApiKey:
    case OctopusDeployConnectionMethod.ApiKey:
    case OpenRouterConnectionMethod.ApiKey:
      return "API Key";
    case AlibabaCloudConnectionMethod.AccessKey:
      return "Access Key";
    case ChefConnectionMethod.UserKey:
      return "User Key";
    case SupabaseConnectionMethod.AccessToken:
      return "Access Token";
    default:
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      throw new Error(`Unhandled App Connection Method: ${method}`);
  }
};

export const decryptAppConnection = async (
  appConnection: TAppConnections,
  kmsService: TAppConnectionServiceFactoryDep["kmsService"]
) => {
  return {
    ...appConnection,
    credentials: await decryptAppConnectionCredentials({
      encryptedCredentials: appConnection.encryptedCredentials,
      orgId: appConnection.orgId,
      projectId: appConnection.projectId,
      kmsService
    }),
    credentialsHash: crypto.nativeCrypto.createHash("sha256").update(appConnection.encryptedCredentials).digest("hex")
  } as TAppConnection;
};

const platformManagedCredentialsNotSupported: TAppConnectionTransitionCredentialsToPlatform = ({ app }) => {
  throw new BadRequestError({
    message: `${APP_CONNECTION_NAME_MAP[app]} Connections do not support platform managed credentials.`
  });
};

export const TRANSITION_CONNECTION_CREDENTIALS_TO_PLATFORM: Record<
  AppConnection,
  TAppConnectionTransitionCredentialsToPlatform
> = {
  [AppConnection.AWS]: platformManagedCredentialsNotSupported,
  [AppConnection.Databricks]: platformManagedCredentialsNotSupported,
  [AppConnection.GitHub]: platformManagedCredentialsNotSupported,
  [AppConnection.GitHubRadar]: platformManagedCredentialsNotSupported,
  [AppConnection.GCP]: platformManagedCredentialsNotSupported,
  [AppConnection.AzureKeyVault]: platformManagedCredentialsNotSupported,
  [AppConnection.AzureAppConfiguration]: platformManagedCredentialsNotSupported,
  [AppConnection.AzureDevOps]: platformManagedCredentialsNotSupported,
  [AppConnection.AzureADCS]: platformManagedCredentialsNotSupported,
  [AppConnection.Humanitec]: platformManagedCredentialsNotSupported,
  [AppConnection.Postgres]: transferSqlConnectionCredentialsToPlatform as TAppConnectionTransitionCredentialsToPlatform,
  [AppConnection.MsSql]: transferSqlConnectionCredentialsToPlatform as TAppConnectionTransitionCredentialsToPlatform,
  [AppConnection.MySql]: transferSqlConnectionCredentialsToPlatform as TAppConnectionTransitionCredentialsToPlatform,
  [AppConnection.TerraformCloud]: platformManagedCredentialsNotSupported,
  [AppConnection.Camunda]: platformManagedCredentialsNotSupported,
  [AppConnection.Vercel]: platformManagedCredentialsNotSupported,
  [AppConnection.AzureClientSecrets]: platformManagedCredentialsNotSupported,
  [AppConnection.Windmill]: platformManagedCredentialsNotSupported,
  [AppConnection.Auth0]: platformManagedCredentialsNotSupported,
  [AppConnection.HCVault]: platformManagedCredentialsNotSupported,
  [AppConnection.LDAP]: platformManagedCredentialsNotSupported, // we could support this in the future
  [AppConnection.TeamCity]: platformManagedCredentialsNotSupported,
  [AppConnection.OCI]: platformManagedCredentialsNotSupported,
  [AppConnection.OracleDB]: transferSqlConnectionCredentialsToPlatform as TAppConnectionTransitionCredentialsToPlatform,
  [AppConnection.OnePass]: platformManagedCredentialsNotSupported,
  [AppConnection.Heroku]: platformManagedCredentialsNotSupported,
  [AppConnection.Render]: platformManagedCredentialsNotSupported,
  [AppConnection.Flyio]: platformManagedCredentialsNotSupported,
  [AppConnection.GitLab]: platformManagedCredentialsNotSupported,
  [AppConnection.Cloudflare]: platformManagedCredentialsNotSupported,
  [AppConnection.DNSMadeEasy]: platformManagedCredentialsNotSupported,
  [AppConnection.Zabbix]: platformManagedCredentialsNotSupported,
  [AppConnection.Railway]: platformManagedCredentialsNotSupported,
  [AppConnection.Bitbucket]: platformManagedCredentialsNotSupported,
  [AppConnection.Checkly]: platformManagedCredentialsNotSupported,
  [AppConnection.Supabase]: platformManagedCredentialsNotSupported,
  [AppConnection.DigitalOcean]: platformManagedCredentialsNotSupported,
  [AppConnection.Netlify]: platformManagedCredentialsNotSupported,
  [AppConnection.Northflank]: platformManagedCredentialsNotSupported,
  [AppConnection.Okta]: platformManagedCredentialsNotSupported,
  [AppConnection.Redis]: platformManagedCredentialsNotSupported,
  [AppConnection.MongoDB]: platformManagedCredentialsNotSupported,
  [AppConnection.LaravelForge]: platformManagedCredentialsNotSupported,
  [AppConnection.Chef]: platformManagedCredentialsNotSupported,
  [AppConnection.OctopusDeploy]: platformManagedCredentialsNotSupported,
  [AppConnection.SSH]: platformManagedCredentialsNotSupported,
  [AppConnection.Dbt]: platformManagedCredentialsNotSupported,
  [AppConnection.SMB]: platformManagedCredentialsNotSupported,
  [AppConnection.OpenRouter]: platformManagedCredentialsNotSupported,
  [AppConnection.CircleCI]: platformManagedCredentialsNotSupported,
  [AppConnection.AlibabaCloud]: platformManagedCredentialsNotSupported
};

export const enterpriseAppCheck = async (
  licenseService: Pick<TLicenseServiceFactory, "getPlan">,
  appConnection: AppConnection,
  orgId: string,
  errorMessage: string
) => {
  if (APP_CONNECTION_PLAN_MAP[appConnection] === AppConnectionPlanType.Enterprise) {
    const plan = await licenseService.getPlan(orgId);
    if (!plan.enterpriseAppConnections)
      throw new BadRequestError({
        message: errorMessage
      });
  }
};

type Resource = {
  name: string;
  id: string;
  projectId: string;
  projectName: string;
  projectSlug: string;
  projectType: string;
};

type UsageData = {
  secretSyncs: Resource[];
  secretRotations: Resource[];
  dataSources: Resource[];
  externalCas: Resource[];
};

type ResourceSummary = {
  name: string;
  id: string;
};

type ProjectWithResources = {
  id: string;
  name: string;
  slug: string;
  type: ProjectType;
  resources: {
    secretSyncs: ResourceSummary[];
    secretRotations: ResourceSummary[];
    dataSources: ResourceSummary[];
    externalCas: (ResourceSummary & { appConnectionId?: string; dnsAppConnectionId?: string })[];
  };
};

export const transformUsageToProjects = (data: UsageData): ProjectWithResources[] => {
  const projectMap = new Map<string, ProjectWithResources>();

  Object.entries(data).forEach(([resourceType, resources]) => {
    resources.forEach((resource) => {
      const { projectId, projectName, projectSlug, projectType, name, id, ...rest } = resource;

      const projectKey = projectId;

      if (!projectMap.has(projectKey)) {
        projectMap.set(projectKey, {
          id: projectId,
          name: projectName,
          slug: projectSlug,
          type: projectType as ProjectType,
          resources: {
            secretSyncs: [],
            secretRotations: [],
            dataSources: [],
            externalCas: []
          }
        });
      }

      const project = projectMap.get(projectKey)!;
      project.resources[resourceType as keyof ProjectWithResources["resources"]].push({
        name,
        id,
        ...rest
      });
    });
  });

  return Array.from(projectMap.values());
};
