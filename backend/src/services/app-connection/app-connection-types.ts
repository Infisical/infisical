import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { TSqlConnectionConfig } from "@app/services/app-connection/shared/sql/sql-connection-types";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { AWSRegion } from "./app-connection-enums";
import { TAwsConnection, TAwsConnectionConfig, TAwsConnectionInput, TValidateAwsConnectionCredentials } from "./aws";
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
import {
  TDatabricksConnection,
  TDatabricksConnectionConfig,
  TDatabricksConnectionInput,
  TValidateDatabricksConnectionCredentials
} from "./databricks";
import { TGcpConnection, TGcpConnectionConfig, TGcpConnectionInput, TValidateGcpConnectionCredentials } from "./gcp";
import {
  TGitHubConnection,
  TGitHubConnectionConfig,
  TGitHubConnectionInput,
  TValidateGitHubConnectionCredentials
} from "./github";
import {
  THumanitecConnection,
  THumanitecConnectionConfig,
  THumanitecConnectionInput,
  TValidateHumanitecConnectionCredentials
} from "./humanitec";
import { TMsSqlConnection, TMsSqlConnectionInput, TValidateMsSqlConnectionCredentials } from "./mssql";
import { TPostgresConnection, TPostgresConnectionInput, TValidatePostgresConnectionCredentials } from "./postgres";

export type TAppConnection = { id: string } & (
  | TAwsConnection
  | TGitHubConnection
  | TGcpConnection
  | TAzureKeyVaultConnection
  | TAzureAppConfigurationConnection
  | TDatabricksConnection
  | THumanitecConnection
  | TPostgresConnection
  | TMsSqlConnection
);

export type TAppConnectionRaw = NonNullable<Awaited<ReturnType<TAppConnectionDALFactory["findById"]>>>;

export type TSqlConnection = TPostgresConnection | TMsSqlConnection;

export type TAppConnectionInput = { id: string } & (
  | TAwsConnectionInput
  | TGitHubConnectionInput
  | TGcpConnectionInput
  | TAzureKeyVaultConnectionInput
  | TAzureAppConfigurationConnectionInput
  | TDatabricksConnectionInput
  | THumanitecConnectionInput
  | TPostgresConnectionInput
  | TMsSqlConnectionInput
);

export type TSqlConnectionInput = TPostgresConnectionInput | TMsSqlConnectionInput;

export type TCreateAppConnectionDTO = Pick<
  TAppConnectionInput,
  "credentials" | "method" | "name" | "app" | "description" | "isPlatformManagedCredentials"
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
  | TSqlConnectionConfig;

export type TValidateAppConnectionCredentials =
  | TValidateAwsConnectionCredentials
  | TValidateGitHubConnectionCredentials
  | TValidateGcpConnectionCredentials
  | TValidateAzureKeyVaultConnectionCredentials
  | TValidateAzureAppConfigurationConnectionCredentials
  | TValidateDatabricksConnectionCredentials
  | TValidateHumanitecConnectionCredentials
  | TValidatePostgresConnectionCredentials
  | TValidateMsSqlConnectionCredentials;

export type TListAwsConnectionKmsKeys = {
  connectionId: string;
  region: AWSRegion;
  destination: SecretSync.AWSParameterStore | SecretSync.AWSSecretsManager;
};

export type TAppConnectionCredentialsValidator = (
  appConnection: TAppConnectionConfig
) => Promise<TAppConnection["credentials"]>;

export type TAppConnectionTransitionCredentialsToPlatform = (
  appConnection: TAppConnectionConfig,
  callback: (credentials: TAppConnection["credentials"]) => Promise<TAppConnectionRaw>
) => Promise<TAppConnectionRaw>;

export type TAppConnectionBaseConfig = {
  supportsPlatformManagedCredentials?: boolean;
};
