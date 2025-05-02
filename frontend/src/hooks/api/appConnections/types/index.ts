import { AppConnection } from "../enums";
import { TAppConnectionOption } from "./app-options";
import { TAuth0Connection } from "./auth0-connection";
import { TAwsConnection } from "./aws-connection";
import { TAzureAppConfigurationConnection } from "./azure-app-configuration-connection";
import { TAzureClientSecretsConnection } from "./azure-client-secrets-connection";
import { TAzureKeyVaultConnection } from "./azure-key-vault-connection";
import { TCamundaConnection } from "./camunda-connection";
import { TDatabricksConnection } from "./databricks-connection";
import { TGcpConnection } from "./gcp-connection";
import { TGitHubConnection } from "./github-connection";
import { THCVaultConnection } from "./hc-vault-connection";
import { THumanitecConnection } from "./humanitec-connection";
import { TLdapConnection } from "./ldap-connection";
import { TMsSqlConnection } from "./mssql-connection";
import { TPostgresConnection } from "./postgres-connection";
import { TTeamCityConnection } from "./teamcity-connection";
import { TTerraformCloudConnection } from "./terraform-cloud-connection";
import { TVercelConnection } from "./vercel-connection";
import { TWindmillConnection } from "./windmill-connection";

export * from "./auth0-connection";
export * from "./aws-connection";
export * from "./azure-app-configuration-connection";
export * from "./azure-client-secrets-connection";
export * from "./azure-key-vault-connection";
export * from "./camunda-connection";
export * from "./databricks-connection";
export * from "./gcp-connection";
export * from "./github-connection";
export * from "./hc-vault-connection";
export * from "./humanitec-connection";
export * from "./ldap-connection";
export * from "./mssql-connection";
export * from "./postgres-connection";
export * from "./teamcity-connection";
export * from "./terraform-cloud-connection";
export * from "./vercel-connection";
export * from "./windmill-connection";

export type TAppConnection =
  | TAwsConnection
  | TGitHubConnection
  | TGcpConnection
  | TAzureKeyVaultConnection
  | TAzureAppConfigurationConnection
  | TAzureClientSecretsConnection
  | TDatabricksConnection
  | THumanitecConnection
  | TTerraformCloudConnection
  | TVercelConnection
  | TPostgresConnection
  | TMsSqlConnection
  | TCamundaConnection
  | TWindmillConnection
  | TAuth0Connection
  | THCVaultConnection
  | TLdapConnection
  | TTeamCityConnection;

export type TAvailableAppConnection = Pick<TAppConnection, "name" | "id">;

export type TListAppConnections<T extends TAppConnection> = { appConnections: T[] };
export type TGetAppConnection<T extends TAppConnection> = { appConnection: T };
export type TAppConnectionOptions = { appConnectionOptions: TAppConnectionOption[] };
export type TAppConnectionResponse = { appConnection: TAppConnection };
export type TAvailableAppConnectionsResponse = { appConnections: TAvailableAppConnection[] };

export type TCreateAppConnectionDTO = Pick<
  TAppConnection,
  "name" | "credentials" | "method" | "app" | "description" | "isPlatformManagedCredentials"
>;

export type TUpdateAppConnectionDTO = Partial<
  Pick<TAppConnection, "name" | "credentials" | "description" | "isPlatformManagedCredentials">
> & {
  connectionId: string;
  app: AppConnection;
};

export type TDeleteAppConnectionDTO = {
  app: AppConnection;
  connectionId: string;
};

export type TAppConnectionMap = {
  [AppConnection.AWS]: TAwsConnection;
  [AppConnection.GitHub]: TGitHubConnection;
  [AppConnection.GCP]: TGcpConnection;
  [AppConnection.AzureKeyVault]: TAzureKeyVaultConnection;
  [AppConnection.AzureAppConfiguration]: TAzureAppConfigurationConnection;
  [AppConnection.AzureClientSecrets]: TAzureClientSecretsConnection;
  [AppConnection.Databricks]: TDatabricksConnection;
  [AppConnection.Humanitec]: THumanitecConnection;
  [AppConnection.TerraformCloud]: TTerraformCloudConnection;
  [AppConnection.Vercel]: TVercelConnection;
  [AppConnection.Postgres]: TPostgresConnection;
  [AppConnection.MsSql]: TMsSqlConnection;
  [AppConnection.Camunda]: TCamundaConnection;
  [AppConnection.Windmill]: TWindmillConnection;
  [AppConnection.Auth0]: TAuth0Connection;
  [AppConnection.HCVault]: THCVaultConnection;
  [AppConnection.LDAP]: TLdapConnection;
  [AppConnection.TeamCity]: TTeamCityConnection;
};
