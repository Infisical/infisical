import { AWSRegion } from "@app/services/app-connection/app-connection-enums";
import {
  TAwsConnection,
  TAwsConnectionConfig,
  TAwsConnectionInput,
  TValidateAwsConnectionCredentials
} from "@app/services/app-connection/aws";
import {
  TDatabricksConnection,
  TDatabricksConnectionConfig,
  TDatabricksConnectionInput,
  TValidateDatabricksConnectionCredentials
} from "@app/services/app-connection/databricks";
import {
  TGitHubConnection,
  TGitHubConnectionConfig,
  TGitHubConnectionInput,
  TValidateGitHubConnectionCredentials
} from "@app/services/app-connection/github";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import {
  TAzureAppConfigurationConnection,
  TAzureAppConfigurationConnectionConfig,
  TAzureAppConfigurationConnectionInput,
  TValidateAzureAppConfigurationConnectionCredentials
} from "./azure-app-configuration";
import {
  TAzureKeyVaultConnection,
  TAzureKeyVaultConnectionConfig,
  TAzureKeyVaultConnectionInput,
  TValidateAzureKeyVaultConnectionCredentials
} from "./azure-key-vault";
import { TGcpConnection, TGcpConnectionConfig, TGcpConnectionInput, TValidateGcpConnectionCredentials } from "./gcp";
import {
  THumanitecConnection,
  THumanitecConnectionConfig,
  THumanitecConnectionInput,
  TValidateHumanitecConnectionCredentials
} from "./humanitec";
import {
  TValidateVercelConnectionCredentials,
  TVercelConnection,
  TVercelConnectionConfig,
  TVercelConnectionInput
} from "./vercel";

export type TAppConnection = { id: string } & (
  | TAwsConnection
  | TGitHubConnection
  | TGcpConnection
  | TAzureKeyVaultConnection
  | TAzureAppConfigurationConnection
  | TDatabricksConnection
  | THumanitecConnection
  | TVercelConnection
);

export type TAppConnectionInput = { id: string } & (
  | TAwsConnectionInput
  | TGitHubConnectionInput
  | TGcpConnectionInput
  | TAzureKeyVaultConnectionInput
  | TAzureAppConfigurationConnectionInput
  | TDatabricksConnectionInput
  | THumanitecConnectionInput
  | TVercelConnectionInput
);

export type TCreateAppConnectionDTO = Pick<
  TAppConnectionInput,
  "credentials" | "method" | "name" | "app" | "description"
>;

export type TUpdateAppConnectionDTO = Partial<Omit<TCreateAppConnectionDTO, "method" | "app">> & {
  connectionId: string;
};

export type TAppConnectionConfig =
  | TAwsConnectionConfig
  | TGitHubConnectionConfig
  | TGcpConnectionConfig
  | TAzureKeyVaultConnectionConfig
  | TAzureAppConfigurationConnectionConfig
  | TDatabricksConnectionConfig
  | THumanitecConnectionConfig
  | TVercelConnectionConfig;

export type TValidateAppConnectionCredentials =
  | TValidateAwsConnectionCredentials
  | TValidateGitHubConnectionCredentials
  | TValidateGcpConnectionCredentials
  | TValidateAzureKeyVaultConnectionCredentials
  | TValidateAzureAppConfigurationConnectionCredentials
  | TValidateDatabricksConnectionCredentials
  | TValidateHumanitecConnectionCredentials
  | TValidateVercelConnectionCredentials;

export type TListAwsConnectionKmsKeys = {
  connectionId: string;
  region: AWSRegion;
  destination: SecretSync.AWSParameterStore | SecretSync.AWSSecretsManager;
};
