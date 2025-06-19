import { AppConnection } from "../enums";
import { TOnePassConnection } from "./1password-connection";
import { TAppConnectionOption } from "./app-options";
import { TAuth0Connection } from "./auth0-connection";
import { TAwsConnection } from "./aws-connection";
import { TAzureAppConfigurationConnection } from "./azure-app-configuration-connection";
import { TAzureClientSecretsConnection } from "./azure-client-secrets-connection";
import { TAzureDevOpsConnection } from "./azure-devops-connection";
import { TAzureKeyVaultConnection } from "./azure-key-vault-connection";
import { TCamundaConnection } from "./camunda-connection";
import { TDatabricksConnection } from "./databricks-connection";
import { TFlyioConnection } from "./flyio-connection";
import { TGcpConnection } from "./gcp-connection";
import { TGitHubConnection } from "./github-connection";
import { TGitHubRadarConnection } from "./github-radar-connection";
import { THCVaultConnection } from "./hc-vault-connection";
import { THerokuConnection } from "./heroku-connection";
import { THumanitecConnection } from "./humanitec-connection";
import { TLdapConnection } from "./ldap-connection";
import { TMsSqlConnection } from "./mssql-connection";
import { TMySqlConnection } from "./mysql-connection";
import { TOCIConnection } from "./oci-connection";
import { TOracleDBConnection } from "./oracledb-connection";
import { TPostgresConnection } from "./postgres-connection";
import { TRenderConnection } from "./render-connection";
import { TTeamCityConnection } from "./teamcity-connection";
import { TTerraformCloudConnection } from "./terraform-cloud-connection";
import { TVercelConnection } from "./vercel-connection";
import { TWindmillConnection } from "./windmill-connection";

export * from "./1password-connection";
export * from "./auth0-connection";
export * from "./aws-connection";
export * from "./azure-app-configuration-connection";
export * from "./azure-client-secrets-connection";
export * from "./azure-devops-connection";
export * from "./azure-key-vault-connection";
export * from "./camunda-connection";
export * from "./databricks-connection";
export * from "./flyio-connection";
export * from "./gcp-connection";
export * from "./github-connection";
export * from "./github-radar-connection";
export * from "./hc-vault-connection";
export * from "./heroku-connection";
export * from "./humanitec-connection";
export * from "./ldap-connection";
export * from "./mssql-connection";
export * from "./mysql-connection";
export * from "./oci-connection";
export * from "./oracledb-connection";
export * from "./postgres-connection";
export * from "./render-connection";
export * from "./teamcity-connection";
export * from "./terraform-cloud-connection";
export * from "./vercel-connection";
export * from "./windmill-connection";

export type TAppConnection =
  | TAwsConnection
  | TGitHubConnection
  | TGitHubRadarConnection
  | TGcpConnection
  | TAzureKeyVaultConnection
  | TAzureAppConfigurationConnection
  | TAzureClientSecretsConnection
  | TAzureDevOpsConnection
  | TDatabricksConnection
  | THumanitecConnection
  | TTerraformCloudConnection
  | TVercelConnection
  | TPostgresConnection
  | TMsSqlConnection
  | TMySqlConnection
  | TOracleDBConnection
  | TCamundaConnection
  | TWindmillConnection
  | TAuth0Connection
  | THCVaultConnection
  | TLdapConnection
  | TTeamCityConnection
  | TOCIConnection
  | TOnePassConnection
  | THerokuConnection
  | TRenderConnection
  | TFlyioConnection;

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
  [AppConnection.GitHubRadar]: TGitHubRadarConnection;
  [AppConnection.GCP]: TGcpConnection;
  [AppConnection.AzureKeyVault]: TAzureKeyVaultConnection;
  [AppConnection.AzureAppConfiguration]: TAzureAppConfigurationConnection;
  [AppConnection.AzureClientSecrets]: TAzureClientSecretsConnection;
  [AppConnection.AzureDevOps]: TAzureDevOpsConnection;
  [AppConnection.Databricks]: TDatabricksConnection;
  [AppConnection.Humanitec]: THumanitecConnection;
  [AppConnection.TerraformCloud]: TTerraformCloudConnection;
  [AppConnection.Vercel]: TVercelConnection;
  [AppConnection.Postgres]: TPostgresConnection;
  [AppConnection.MsSql]: TMsSqlConnection;
  [AppConnection.MySql]: TMySqlConnection;
  [AppConnection.OracleDB]: TOracleDBConnection;
  [AppConnection.Camunda]: TCamundaConnection;
  [AppConnection.Windmill]: TWindmillConnection;
  [AppConnection.Auth0]: TAuth0Connection;
  [AppConnection.HCVault]: THCVaultConnection;
  [AppConnection.LDAP]: TLdapConnection;
  [AppConnection.TeamCity]: TTeamCityConnection;
  [AppConnection.OCI]: TOCIConnection;
  [AppConnection.OnePass]: TOnePassConnection;
  [AppConnection.Heroku]: THerokuConnection;
  [AppConnection.Render]: TRenderConnection;
  [AppConnection.Flyio]: TFlyioConnection;
};
