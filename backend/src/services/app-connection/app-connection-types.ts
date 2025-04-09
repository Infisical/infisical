import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { TSqlConnectionConfig } from "@app/services/app-connection/shared/sql/sql-connection-types";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { AWSRegion } from "./app-connection-enums";
import {
  TAwsConnection,
  TAwsConnectionConfig,
  TAwsConnectionInput,
  TValidateAwsConnectionCredentialsSchema
} from "./aws";
import {
  TAzureAppConfigurationConnection,
  TAzureAppConfigurationConnectionConfig,
  TAzureAppConfigurationConnectionInput,
  TValidateAzureAppConfigurationConnectionCredentialsSchema
} from "./azure-app-configuration";
import {
  TAzureKeyVaultConnection,
  TAzureKeyVaultConnectionConfig,
  TAzureKeyVaultConnectionInput,
  TValidateAzureKeyVaultConnectionCredentialsSchema
} from "./azure-key-vault";
import {
  TDatabricksConnection,
  TDatabricksConnectionConfig,
  TDatabricksConnectionInput,
  TValidateDatabricksConnectionCredentialsSchema
} from "./databricks";
import {
  TGcpConnection,
  TGcpConnectionConfig,
  TGcpConnectionInput,
  TValidateGcpConnectionCredentialsSchema
} from "./gcp";
import {
  TGitHubConnection,
  TGitHubConnectionConfig,
  TGitHubConnectionInput,
  TValidateGitHubConnectionCredentialsSchema
} from "./github";
import {
  THumanitecConnection,
  THumanitecConnectionConfig,
  THumanitecConnectionInput,
  TValidateHumanitecConnectionCredentialsSchema
} from "./humanitec";
import { TMsSqlConnection, TMsSqlConnectionInput, TValidateMsSqlConnectionCredentialsSchema } from "./mssql";
import {
  TPostgresConnection,
  TPostgresConnectionInput,
  TValidatePostgresConnectionCredentialsSchema
} from "./postgres";

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

export type TValidateAppConnectionCredentialsSchema =
  | TValidateAwsConnectionCredentialsSchema
  | TValidateGitHubConnectionCredentialsSchema
  | TValidateGcpConnectionCredentialsSchema
  | TValidateAzureKeyVaultConnectionCredentialsSchema
  | TValidateAzureAppConfigurationConnectionCredentialsSchema
  | TValidateDatabricksConnectionCredentialsSchema
  | TValidateHumanitecConnectionCredentialsSchema
  | TValidatePostgresConnectionCredentialsSchema
  | TValidateMsSqlConnectionCredentialsSchema;

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
