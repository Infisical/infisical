import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { TSqlConnectionConfig } from "@app/services/app-connection/shared/sql/sql-connection-types";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { AWSRegion } from "./app-connection-enums";
import {
  TAuth0Connection,
  TAuth0ConnectionConfig,
  TAuth0ConnectionInput,
  TValidateAuth0ConnectionCredentialsSchema
} from "./auth0";
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
  TAzureClientSecretsConnection,
  TAzureClientSecretsConnectionConfig,
  TAzureClientSecretsConnectionInput,
  TValidateAzureClientSecretsConnectionCredentialsSchema
} from "./azure-client-secrets";
import {
  TAzureKeyVaultConnection,
  TAzureKeyVaultConnectionConfig,
  TAzureKeyVaultConnectionInput,
  TValidateAzureKeyVaultConnectionCredentialsSchema
} from "./azure-key-vault";
import {
  TCamundaConnection,
  TCamundaConnectionConfig,
  TCamundaConnectionInput,
  TValidateCamundaConnectionCredentialsSchema
} from "./camunda";
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
  THCVaultConnection,
  THCVaultConnectionConfig,
  THCVaultConnectionInput,
  TValidateHCVaultConnectionCredentialsSchema
} from "./hc-vault";
import {
  THumanitecConnection,
  THumanitecConnectionConfig,
  THumanitecConnectionInput,
  TValidateHumanitecConnectionCredentialsSchema
} from "./humanitec";
import {
  TLdapConnection,
  TLdapConnectionConfig,
  TLdapConnectionInput,
  TValidateLdapConnectionCredentialsSchema
} from "./ldap";
import { TMsSqlConnection, TMsSqlConnectionInput, TValidateMsSqlConnectionCredentialsSchema } from "./mssql";
import {
  TPostgresConnection,
  TPostgresConnectionInput,
  TValidatePostgresConnectionCredentialsSchema
} from "./postgres";
import {
  TTeamCityConnection,
  TTeamCityConnectionConfig,
  TTeamCityConnectionInput,
  TValidateTeamCityConnectionCredentialsSchema
} from "./teamcity";
import {
  TTerraformCloudConnection,
  TTerraformCloudConnectionConfig,
  TTerraformCloudConnectionInput,
  TValidateTerraformCloudConnectionCredentialsSchema
} from "./terraform-cloud";
import {
  TValidateVercelConnectionCredentialsSchema,
  TVercelConnection,
  TVercelConnectionConfig,
  TVercelConnectionInput
} from "./vercel";
import {
  TValidateWindmillConnectionCredentialsSchema,
  TWindmillConnection,
  TWindmillConnectionConfig,
  TWindmillConnectionInput
} from "./windmill";

export type TAppConnection = { id: string } & (
  | TAwsConnection
  | TGitHubConnection
  | TGcpConnection
  | TAzureKeyVaultConnection
  | TAzureAppConfigurationConnection
  | TDatabricksConnection
  | THumanitecConnection
  | TTerraformCloudConnection
  | TVercelConnection
  | TPostgresConnection
  | TMsSqlConnection
  | TCamundaConnection
  | TAzureClientSecretsConnection
  | TWindmillConnection
  | TAuth0Connection
  | THCVaultConnection
  | TLdapConnection
  | TTeamCityConnection
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
  | TTerraformCloudConnectionInput
  | TVercelConnectionInput
  | TPostgresConnectionInput
  | TMsSqlConnectionInput
  | TCamundaConnectionInput
  | TAzureClientSecretsConnectionInput
  | TWindmillConnectionInput
  | TAuth0ConnectionInput
  | THCVaultConnectionInput
  | TLdapConnectionInput
  | TTeamCityConnectionInput
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
  | TAzureClientSecretsConnectionConfig
  | TDatabricksConnectionConfig
  | THumanitecConnectionConfig
  | TTerraformCloudConnectionConfig
  | TSqlConnectionConfig
  | TCamundaConnectionConfig
  | TVercelConnectionConfig
  | TWindmillConnectionConfig
  | TAuth0ConnectionConfig
  | THCVaultConnectionConfig
  | TLdapConnectionConfig
  | TTeamCityConnectionConfig;

export type TValidateAppConnectionCredentialsSchema =
  | TValidateAwsConnectionCredentialsSchema
  | TValidateGitHubConnectionCredentialsSchema
  | TValidateGcpConnectionCredentialsSchema
  | TValidateAzureKeyVaultConnectionCredentialsSchema
  | TValidateAzureAppConfigurationConnectionCredentialsSchema
  | TValidateAzureClientSecretsConnectionCredentialsSchema
  | TValidateDatabricksConnectionCredentialsSchema
  | TValidateHumanitecConnectionCredentialsSchema
  | TValidatePostgresConnectionCredentialsSchema
  | TValidateMsSqlConnectionCredentialsSchema
  | TValidateCamundaConnectionCredentialsSchema
  | TValidateVercelConnectionCredentialsSchema
  | TValidateTerraformCloudConnectionCredentialsSchema
  | TValidateWindmillConnectionCredentialsSchema
  | TValidateAuth0ConnectionCredentialsSchema
  | TValidateHCVaultConnectionCredentialsSchema
  | TValidateLdapConnectionCredentialsSchema
  | TValidateTeamCityConnectionCredentialsSchema;

export type TListAwsConnectionKmsKeys = {
  connectionId: string;
  region: AWSRegion;
  destination: SecretSync.AWSParameterStore | SecretSync.AWSSecretsManager;
};

export type TListAwsConnectionIamUsers = {
  connectionId: string;
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
