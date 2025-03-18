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

export type TPostgresConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.Postgres;
};

export type TMsSqlConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.MsSql;
};

export type TAppConnectionOption =
  | TAwsConnectionOption
  | TGitHubConnectionOption
  | TGcpConnectionOption
  | TAzureAppConfigurationConnectionOption
  | TAzureKeyVaultConnectionOption
  | TDatabricksConnectionOption
  | THumanitecConnectionOption
  | TPostgresConnectionOption
  | TMsSqlConnectionOption;

export type TAppConnectionOptionMap = {
  [AppConnection.AWS]: TAwsConnectionOption;
  [AppConnection.GitHub]: TGitHubConnectionOption;
  [AppConnection.GCP]: TGcpConnectionOption;
  [AppConnection.AzureKeyVault]: TAzureKeyVaultConnectionOption;
  [AppConnection.AzureAppConfiguration]: TAzureAppConfigurationConnectionOption;
  [AppConnection.Databricks]: TDatabricksConnectionOption;
  [AppConnection.Humanitec]: THumanitecConnectionOption;
  [AppConnection.Postgres]: TPostgresConnectionOption;
  [AppConnection.MsSql]: TMsSqlConnectionOption;
};
