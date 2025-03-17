import { TAppConnections } from "@app/db/schemas/app-connections";
import { generateHash } from "@app/lib/crypto/encryption";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { AppConnection } from "./app-connection-enums";
import { TAppConnectionServiceFactoryDep } from "./app-connection-service";
import { TAppConnection, TAppConnectionConfig, TAppConnectionCredentialValidator } from "./app-connection-types";
import { AwsConnectionMethod, getAwsConnectionListItem, validateAwsConnectionCredentials } from "./aws";
import {
  AzureAppConfigurationConnectionMethod,
  getAzureAppConfigurationConnectionListItem,
  validateAzureAppConfigurationConnectionCredentials
} from "./azure-app-configuration";
import {
  AzureKeyVaultConnectionMethod,
  getAzureKeyVaultConnectionListItem,
  validateAzureKeyVaultConnectionCredentials
} from "./azure-key-vault";
import {
  DatabricksConnectionMethod,
  getDatabricksConnectionListItem,
  validateDatabricksConnectionCredentials
} from "./databricks";
import { GcpConnectionMethod, getGcpConnectionListItem, validateGcpConnectionCredentials } from "./gcp";
import { getGitHubConnectionListItem, GitHubConnectionMethod, validateGitHubConnectionCredentials } from "./github";
import {
  getHumanitecConnectionListItem,
  HumanitecConnectionMethod,
  validateHumanitecConnectionCredentials
} from "./humanitec";
import { getMsSqlConnectionListItem, MsSqlConnectionMethod, validateMsSqlConnectionCredentials } from "./mssql";
import {
  getPostgresConnectionListItem,
  PostgresConnectionMethod,
  validatePostgresConnectionCredentials
} from "./postgres";

export const listAppConnectionOptions = () => {
  return [
    getAwsConnectionListItem(),
    getGitHubConnectionListItem(),
    getGcpConnectionListItem(),
    getAzureKeyVaultConnectionListItem(),
    getAzureAppConfigurationConnectionListItem(),
    getDatabricksConnectionListItem(),
    getHumanitecConnectionListItem(),
    getPostgresConnectionListItem(),
    getMsSqlConnectionListItem()
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

const VALIDATE_APP_CONNECTION_CREDENTIALS_MAP: Record<AppConnection, TAppConnectionCredentialValidator> = {
  [AppConnection.AWS]: validateAwsConnectionCredentials as TAppConnectionCredentialValidator,
  [AppConnection.Databricks]: validateDatabricksConnectionCredentials as TAppConnectionCredentialValidator,
  [AppConnection.GitHub]: validateGitHubConnectionCredentials as TAppConnectionCredentialValidator,
  [AppConnection.GCP]: validateGcpConnectionCredentials as TAppConnectionCredentialValidator,
  [AppConnection.AzureKeyVault]: validateAzureKeyVaultConnectionCredentials as TAppConnectionCredentialValidator,
  [AppConnection.AzureAppConfiguration]:
    validateAzureAppConfigurationConnectionCredentials as TAppConnectionCredentialValidator,
  [AppConnection.Humanitec]: validateHumanitecConnectionCredentials as TAppConnectionCredentialValidator,
  [AppConnection.Postgres]: validatePostgresConnectionCredentials as TAppConnectionCredentialValidator,
  [AppConnection.MsSql]: validateMsSqlConnectionCredentials as TAppConnectionCredentialValidator
};

export const validateAppConnectionCredentials = async (
  appConnection: TAppConnectionConfig
): Promise<TAppConnection["credentials"]> => VALIDATE_APP_CONNECTION_CREDENTIALS_MAP[appConnection.app](appConnection);

export const getAppConnectionMethodName = (method: TAppConnection["method"]) => {
  switch (method) {
    case GitHubConnectionMethod.App:
      return "GitHub App";
    case AzureKeyVaultConnectionMethod.OAuth:
    case AzureAppConfigurationConnectionMethod.OAuth:
    case GitHubConnectionMethod.OAuth:
      return "OAuth";
    case AwsConnectionMethod.AccessKey:
      return "Access Key";
    case AwsConnectionMethod.AssumeRole:
      return "Assume Role";
    case GcpConnectionMethod.ServiceAccountImpersonation:
      return "Service Account Impersonation";
    case DatabricksConnectionMethod.ServicePrincipal:
      return "Service Principal";
    case HumanitecConnectionMethod.ApiToken:
      return "API Token";
    case PostgresConnectionMethod.UsernameAndPassword:
    case MsSqlConnectionMethod.UsernameAndPassword:
      return "Username & Password";
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
