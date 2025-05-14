import { TAppConnections } from "@app/db/schemas/app-connections";
import { generateHash } from "@app/lib/crypto/encryption";
import { BadRequestError } from "@app/lib/errors";
import { APP_CONNECTION_NAME_MAP } from "@app/services/app-connection/app-connection-maps";
import {
  transferSqlConnectionCredentialsToPlatform,
  validateSqlConnectionCredentials
} from "@app/services/app-connection/shared/sql";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { AppConnection } from "./app-connection-enums";
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
import { GcpConnectionMethod, getGcpConnectionListItem, validateGcpConnectionCredentials } from "./gcp";
import { getGitHubConnectionListItem, GitHubConnectionMethod, validateGitHubConnectionCredentials } from "./github";
import {
  getHCVaultConnectionListItem,
  HCVaultConnectionMethod,
  validateHCVaultConnectionCredentials
} from "./hc-vault";
import {
  getHumanitecConnectionListItem,
  HumanitecConnectionMethod,
  validateHumanitecConnectionCredentials
} from "./humanitec";
import { getLdapConnectionListItem, LdapConnectionMethod, validateLdapConnectionCredentials } from "./ldap";
import { getMsSqlConnectionListItem, MsSqlConnectionMethod } from "./mssql";
import { getOCIConnectionListItem, OCIConnectionMethod, validateOCIConnectionCredentials } from "./oci";
import { getPostgresConnectionListItem, PostgresConnectionMethod } from "./postgres";
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
    getGcpConnectionListItem(),
    getAzureKeyVaultConnectionListItem(),
    getAzureAppConfigurationConnectionListItem(),
    getDatabricksConnectionListItem(),
    getHumanitecConnectionListItem(),
    getTerraformCloudConnectionListItem(),
    getVercelConnectionListItem(),
    getPostgresConnectionListItem(),
    getMsSqlConnectionListItem(),
    getCamundaConnectionListItem(),
    getAzureClientSecretsConnectionListItem(),
    getWindmillConnectionListItem(),
    getAuth0ConnectionListItem(),
    getHCVaultConnectionListItem(),
    getLdapConnectionListItem(),
    getTeamCityConnectionListItem(),
    getOCIConnectionListItem()
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
    [AppConnection.GCP]: validateGcpConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.AzureKeyVault]: validateAzureKeyVaultConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.AzureAppConfiguration]:
      validateAzureAppConfigurationConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.AzureClientSecrets]:
      validateAzureClientSecretsConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.Humanitec]: validateHumanitecConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.Postgres]: validateSqlConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.MsSql]: validateSqlConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.Camunda]: validateCamundaConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.Vercel]: validateVercelConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.TerraformCloud]: validateTerraformCloudConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.Auth0]: validateAuth0ConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.Windmill]: validateWindmillConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.HCVault]: validateHCVaultConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.LDAP]: validateLdapConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.TeamCity]: validateTeamCityConnectionCredentials as TAppConnectionCredentialsValidator,
    [AppConnection.OCI]: validateOCIConnectionCredentials as TAppConnectionCredentialsValidator
  };

  return VALIDATE_APP_CONNECTION_CREDENTIALS_MAP[appConnection.app](appConnection);
};

export const getAppConnectionMethodName = (method: TAppConnection["method"]) => {
  switch (method) {
    case GitHubConnectionMethod.App:
      return "GitHub App";
    case AzureKeyVaultConnectionMethod.OAuth:
    case AzureAppConfigurationConnectionMethod.OAuth:
    case AzureClientSecretsConnectionMethod.OAuth:
    case GitHubConnectionMethod.OAuth:
      return "OAuth";
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
      return "API Token";
    case PostgresConnectionMethod.UsernameAndPassword:
    case MsSqlConnectionMethod.UsernameAndPassword:
      return "Username & Password";
    case WindmillConnectionMethod.AccessToken:
    case HCVaultConnectionMethod.AccessToken:
    case TeamCityConnectionMethod.AccessToken:
      return "Access Token";
    case Auth0ConnectionMethod.ClientCredentials:
      return "Client Credentials";
    case HCVaultConnectionMethod.AppRole:
      return "App Role";
    case LdapConnectionMethod.SimpleBind:
      return "Simple Bind";
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
  [AppConnection.GCP]: platformManagedCredentialsNotSupported,
  [AppConnection.AzureKeyVault]: platformManagedCredentialsNotSupported,
  [AppConnection.AzureAppConfiguration]: platformManagedCredentialsNotSupported,
  [AppConnection.Humanitec]: platformManagedCredentialsNotSupported,
  [AppConnection.Postgres]: transferSqlConnectionCredentialsToPlatform as TAppConnectionTransitionCredentialsToPlatform,
  [AppConnection.MsSql]: transferSqlConnectionCredentialsToPlatform as TAppConnectionTransitionCredentialsToPlatform,
  [AppConnection.TerraformCloud]: platformManagedCredentialsNotSupported,
  [AppConnection.Camunda]: platformManagedCredentialsNotSupported,
  [AppConnection.Vercel]: platformManagedCredentialsNotSupported,
  [AppConnection.AzureClientSecrets]: platformManagedCredentialsNotSupported,
  [AppConnection.Windmill]: platformManagedCredentialsNotSupported,
  [AppConnection.Auth0]: platformManagedCredentialsNotSupported,
  [AppConnection.HCVault]: platformManagedCredentialsNotSupported,
  [AppConnection.LDAP]: platformManagedCredentialsNotSupported, // we could support this in the future
  [AppConnection.TeamCity]: platformManagedCredentialsNotSupported,
  [AppConnection.OCI]: platformManagedCredentialsNotSupported
};
