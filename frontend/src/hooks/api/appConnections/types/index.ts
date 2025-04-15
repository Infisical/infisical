import { AppConnection } from "../enums";
import { TAppConnectionOption } from "./app-options";
import { TAuth0Connection } from "./auth0-connection";
import { TAwsConnection } from "./aws-connection";
import { TAzureAppConfigurationConnection } from "./azure-app-configuration-connection";
import { TAzureKeyVaultConnection } from "./azure-key-vault-connection";
import { TCamundaConnection } from "./camunda-connection";
import { TDatabricksConnection } from "./databricks-connection";
import { TGcpConnection } from "./gcp-connection";
import { TGitHubConnection } from "./github-connection";
import { THumanitecConnection } from "./humanitec-connection";
import { TMsSqlConnection } from "./mssql-connection";
import { TPostgresConnection } from "./postgres-connection";
import { TTerraformCloudConnection } from "./terraform-cloud-connection";
import { TVercelConnection } from "./vercel-connection";

export * from "./auth0-connection";
export * from "./aws-connection";
export * from "./azure-app-configuration-connection";
export * from "./azure-key-vault-connection";
export * from "./camunda-connection";
export * from "./databricks-connection";
export * from "./gcp-connection";
export * from "./github-connection";
export * from "./humanitec-connection";
export * from "./mssql-connection";
export * from "./postgres-connection";
export * from "./terraform-cloud-connection";
export * from "./vercel-connection";

export type TAppConnection =
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
  | TAuth0Connection;

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
  [AppConnection.Databricks]: TDatabricksConnection;
  [AppConnection.Humanitec]: THumanitecConnection;
  [AppConnection.TerraformCloud]: TTerraformCloudConnection;
  [AppConnection.Vercel]: TVercelConnection;
  [AppConnection.Postgres]: TPostgresConnection;
  [AppConnection.MsSql]: TMsSqlConnection;
  [AppConnection.Camunda]: TCamundaConnection;
  [AppConnection.Auth0]: TAuth0Connection;
};
