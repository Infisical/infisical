import { TAppConnections } from "@app/db/schemas/app-connections";
import {
  getOCIConnectionListItem,
  OCIConnectionMethod,
  validateOCIConnectionCredentials
} from "@app/ee/services/app-connections/oci";
import { getOracleDBConnectionListItem, OracleDBConnectionMethod } from "@app/ee/services/app-connections/oracledb";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { generateHash } from "@app/lib/crypto/encryption";
import { BadRequestError } from "@app/lib/errors";
import { APP_CONNECTION_NAME_MAP, APP_CONNECTION_PLAN_MAP } from "@app/services/app-connection/app-connection-maps";
import {
  transferSqlConnectionCredentialsToPlatform,
  validateSqlConnectionCredentials
} from "@app/services/app-connection/shared/sql";
import { KmsDataKey } from "@app/services/kms/kms-types";

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
import { CamundaConnectionMethod, getCamundaConnectionListItem, validateCamundaConnectionCredentials } from "./camunda";
import {
  DatabricksConnectionMethod,
  getDatabricksConnectionListItem,
  validateDatabricksConnectionCredentials
} from "./databricks";
import { FlyioConnectionMethod, getFlyioConnectionListItem, validateFlyioConnectionCredentials } from "./flyio";
import { GcpConnectionMethod, getGcpConnectionListItem, validateGcpConnectionCredentials } from "./gcp";
import { getGitHubConnectionListItem, GitHubConnectionMethod, validateGitHubConnectionCredentials } from "./github";
import {
  getGitHubRadarConnectionListItem,
  GitHubRadarConnectionMethod,
  validateGitHubRadarConnectionCredentials
} from "./github-radar";
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
import { getLdapConnectionListItem, LdapConnectionMethod, validateLdapConnectionCredentials } from "./ldap";
import { getMsSqlConnectionListItem, MsSqlConnectionMethod } from "./mssql";
import { MySqlConnectionMethod } from "./mysql/mysql-connection-enums";
import { getMySqlConnectionListItem } from "./mysql/mysql-connection-fns";
import { getPostgresConnectionListItem, PostgresConnectionMethod } from "./postgres";
import { RenderConnectionMethod } from "./render/render-connection-enums";
import { getRenderConnectionListItem, validateRenderConnectionCredentials } from "./render/render-connection-fns";
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

export const listAppConnectionOptions = () => {
  return [
    getAwsConnectionListItem(),
    getGitHubConnectionListItem(),
    getGitHubRadarConnectionListItem(),
    getGcpConnectionListItem(),
    getAzureKeyVaultConnectionListItem(),
    getAzureAppConfigurationConnectionListItem(),
    getAzureDevopsConnectionListItem(),
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
    getFlyioConnectionListItem()
  ].sort((a, b) => a.name.localeCompare(b.name));
};

export const encryptAppConnectionCredentials = async ({
  orgId,
  credentials,
  kmsService
}: {
  orgId: string;
  credentials: TAppConnection["credentials"];
  kmsService: TAppConnectionServiceFactoryDep["kmsService"];
}) => {
  const { encryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.Organization,
    orgId
  });

  const { cipherTextBlob: encryptedCredentialsBlob } = encryptor({
    plainText: Buffer.from(JSON.stringify(credentials))
  });

  return encryptedCredentialsBlob;
};

export const decryptAppConnectionCredentials = async ({
  orgId,
  encryptedCredentials,
  kmsService
}: {
  orgId: string;
  encryptedCredentials: Buffer;
  kmsService: TAppConnectionServiceFactoryDep["kmsService"];
}) => {
  const { decryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.Organization,
    orgId
  });

  const decryptedPlainTextBlob = decryptor({
    cipherTextBlob: encryptedCredentials
  });

  return JSON.parse(decryptedPlainTextBlob.toString()) as TAppConnection["credentials"];
};

export const validateAppConnectionCredentials = async (
  appConnection: TAppConnectionConfig
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
    [AppConnection.Flyio]: validateFlyioConnectionCredentials as TAppConnectionCredentialsValidator
  };

  return VALIDATE_APP_CONNECTION_CREDENTIALS_MAP[appConnection.app](appConnection);
};

export const getAppConnectionMethodName = (method: TAppConnection["method"]) => {
  switch (method) {
    case GitHubConnectionMethod.App:
    case GitHubRadarConnectionMethod.App:
      return "GitHub App";
    case AzureKeyVaultConnectionMethod.OAuth:
    case AzureAppConfigurationConnectionMethod.OAuth:
    case AzureClientSecretsConnectionMethod.OAuth:
    case GitHubConnectionMethod.OAuth:
    case AzureDevOpsConnectionMethod.OAuth:
    case HerokuConnectionMethod.OAuth:
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
      return "API Token";
    case PostgresConnectionMethod.UsernameAndPassword:
    case MsSqlConnectionMethod.UsernameAndPassword:
    case MySqlConnectionMethod.UsernameAndPassword:
    case OracleDBConnectionMethod.UsernameAndPassword:
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
    case RenderConnectionMethod.ApiKey:
      return "API Key";
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
      kmsService
    }),
    credentialsHash: generateHash(appConnection.encryptedCredentials)
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
  [AppConnection.Flyio]: platformManagedCredentialsNotSupported
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
