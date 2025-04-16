import { AppConnection } from "@app/hooks/api/appConnections/enums";

export type TAppConnectionOptionBase = {
  name: string;
  methods: string[];
  supportsPlatformManagement?: boolean;
};

export type TAwsConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.AWS;
  accessKeyId?: string;
};

export type TGitHubConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.GitHub;
  oauthClientId?: string;
  appClientSlug?: string;
};

export type TGcpConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.GCP;
};

export type TAzureKeyVaultConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.AzureKeyVault;
  oauthClientId?: string;
};

export type TAzureAppConfigurationConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.AzureKeyVault;
  oauthClientId?: string;
};

export type TDatabricksConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.Databricks;
};

export type THumanitecConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.Humanitec;
};

export type TTerraformCloudConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.TerraformCloud;
};

export type TVercelConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.Vercel;
};

export type TPostgresConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.Postgres;
};

export type TMsSqlConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.MsSql;
};

export type TCamundaConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.Camunda;
};

export type TAuth0ConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.Auth0;
};

export type TAppConnectionOption =
  | TAwsConnectionOption
  | TGitHubConnectionOption
  | TGcpConnectionOption
  | TAzureAppConfigurationConnectionOption
  | TAzureKeyVaultConnectionOption
  | TDatabricksConnectionOption
  | THumanitecConnectionOption
  | TTerraformCloudConnectionOption
  | TVercelConnectionOption
  | TPostgresConnectionOption
  | TMsSqlConnectionOption
  | TCamundaConnectionOption
  | TAuth0ConnectionOption;

export type TAppConnectionOptionMap = {
  [AppConnection.AWS]: TAwsConnectionOption;
  [AppConnection.GitHub]: TGitHubConnectionOption;
  [AppConnection.GCP]: TGcpConnectionOption;
  [AppConnection.AzureKeyVault]: TAzureKeyVaultConnectionOption;
  [AppConnection.AzureAppConfiguration]: TAzureAppConfigurationConnectionOption;
  [AppConnection.Databricks]: TDatabricksConnectionOption;
  [AppConnection.Humanitec]: THumanitecConnectionOption;
  [AppConnection.TerraformCloud]: TTerraformCloudConnectionOption;
  [AppConnection.Vercel]: TVercelConnectionOption;
  [AppConnection.Postgres]: TPostgresConnectionOption;
  [AppConnection.MsSql]: TMsSqlConnectionOption;
  [AppConnection.Camunda]: TCamundaConnectionOption;
  [AppConnection.Auth0]: TAuth0ConnectionOption;
};
