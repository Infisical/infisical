import { TAppConnections } from "@app/db/schemas/app-connections";
import { generateHash } from "@app/lib/crypto/encryption";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { TAppConnectionServiceFactoryDep } from "@app/services/app-connection/app-connection-service";
import { TAppConnection, TAppConnectionConfig } from "@app/services/app-connection/app-connection-types";
import {
  AwsConnectionMethod,
  getAwsConnectionListItem,
  validateAwsConnectionCredentials
} from "@app/services/app-connection/aws";
import {
  DatabricksConnectionMethod,
  getDatabricksConnectionListItem,
  validateDatabricksConnectionCredentials
} from "@app/services/app-connection/databricks";
import {
  GcpConnectionMethod,
  getGcpConnectionListItem,
  validateGcpConnectionCredentials
} from "@app/services/app-connection/gcp";
import {
  getGitHubConnectionListItem,
  GitHubConnectionMethod,
  validateGitHubConnectionCredentials
} from "@app/services/app-connection/github";
import { KmsDataKey } from "@app/services/kms/kms-types";

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
  getHumanitecConnectionListItem,
  HumanitecConnectionMethod,
  validateHumanitecConnectionCredentials
} from "./humanitec";

export const listAppConnectionOptions = () => {
  return [
    getAwsConnectionListItem(),
    getGitHubConnectionListItem(),
    getGcpConnectionListItem(),
    getAzureKeyVaultConnectionListItem(),
    getAzureAppConfigurationConnectionListItem(),
    getDatabricksConnectionListItem(),
    getHumanitecConnectionListItem()
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
  const { app } = appConnection;
  switch (app) {
    case AppConnection.AWS:
      return validateAwsConnectionCredentials(appConnection);
    case AppConnection.Databricks:
      return validateDatabricksConnectionCredentials(appConnection);
    case AppConnection.GitHub:
      return validateGitHubConnectionCredentials(appConnection);
    case AppConnection.GCP:
      return validateGcpConnectionCredentials(appConnection);
    case AppConnection.AzureKeyVault:
      return validateAzureKeyVaultConnectionCredentials(appConnection);
    case AppConnection.AzureAppConfiguration:
      return validateAzureAppConfigurationConnectionCredentials(appConnection);
    case AppConnection.Humanitec:
      return validateHumanitecConnectionCredentials(appConnection);
    default:
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      throw new Error(`Unhandled App Connection ${app}`);
  }
};

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
    case HumanitecConnectionMethod.API_TOKEN:
      return "API Token";
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
