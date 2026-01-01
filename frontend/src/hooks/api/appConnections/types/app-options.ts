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

export type TGitHubRadarConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.GitHubRadar;
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
  app: AppConnection.AzureAppConfiguration;
  oauthClientId?: string;
};

export type TAzureClientSecretsConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.AzureClientSecrets;
  oauthClientId?: string;
};

export type TDatabricksConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.Databricks;
};

export type TAzureDevOpsConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.AzureDevOps;
  oauthClientId?: string;
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

export type TMySqlConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.MySql;
};

export type TOracleDBConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.OracleDB;
};

export type TCamundaConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.Camunda;
};

export type TWindmillConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.Windmill;
};

export type TAuth0ConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.Auth0;
};

export type THCVaultConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.HCVault;
};

export type TOctopusDeployConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.OctopusDeploy;
};

export type TLdapConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.LDAP;
};

export type TTeamCityConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.TeamCity;
};

export type TOCIConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.OCI;
};

export type THerokuConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.Heroku;
  oauthClientId?: string;
};

export type TOnePassConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.OnePass;
};

export type TRenderConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.Render;
};

export type TFlyioConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.Flyio;
};

export type TGitlabConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.GitLab;
  oauthClientId?: string;
};

export type TCloudflareConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.Cloudflare;
};

export type TBitbucketConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.Bitbucket;
};

export type TZabbixConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.Zabbix;
};

export type TRailwayConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.Railway;
};

export type TChecklyConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.Checkly;
};

export type TChefConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.Chef;
};

export type TSupabaseConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.Supabase;
};

export type TDigitalOceanConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.DigitalOcean;
};

export type TNetlifyConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.Netlify;
};

export type TConvexConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.Convex;
};

export type TOktaConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.Okta;
};

export type TLaravelForgeConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.LaravelForge;
};

export type TNorthflankConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.Northflank;
};

export type TAzureAdCsConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.AzureADCS;
};

export type TRedisConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.Redis;
};

export type TMongoDBConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.MongoDB;
};

export type TDNSMadeEasyConnectionOption = TAppConnectionOptionBase & {
  app: AppConnection.DNSMadeEasy;
};

export type TAppConnectionOption =
  | TAwsConnectionOption
  | TGitHubConnectionOption
  | TGitHubRadarConnectionOption
  | TGcpConnectionOption
  | TAzureAppConfigurationConnectionOption
  | TAzureKeyVaultConnectionOption
  | TAzureClientSecretsConnectionOption
  | TAzureDevOpsConnectionOption
  | TDatabricksConnectionOption
  | THumanitecConnectionOption
  | TTerraformCloudConnectionOption
  | TVercelConnectionOption
  | TPostgresConnectionOption
  | TMsSqlConnectionOption
  | TMySqlConnectionOption
  | TOracleDBConnectionOption
  | TCamundaConnectionOption
  | TWindmillConnectionOption
  | TAuth0ConnectionOption
  | THCVaultConnectionOption
  | TLdapConnectionOption
  | TTeamCityConnectionOption
  | TOCIConnectionOption
  | TOnePassConnectionOption
  | THerokuConnectionOption
  | TRenderConnectionOption
  | TFlyioConnectionOption
  | TGitlabConnectionOption
  | TCloudflareConnectionOption
  | TBitbucketConnectionOption
  | TZabbixConnectionOption
  | TRailwayConnectionOption
  | TChecklyConnectionOption
  | TSupabaseConnectionOption
  | TDigitalOceanConnectionOption
  | TNetlifyConnectionOption
  | TConvexConnectionOption
  | TNorthflankConnectionOption
  | TOktaConnectionOption
  | TAzureAdCsConnectionOption
  | TLaravelForgeConnectionOption
  | TRedisConnectionOption
  | TMongoDBConnectionOption
  | TChefConnectionOption
  | TDNSMadeEasyConnectionOption
  | TOctopusDeployConnectionOption;

export type TAppConnectionOptionMap = {
  [AppConnection.AWS]: TAwsConnectionOption;
  [AppConnection.GitHub]: TGitHubConnectionOption;
  [AppConnection.GitHubRadar]: TGitHubRadarConnectionOption;
  [AppConnection.GCP]: TGcpConnectionOption;
  [AppConnection.AzureKeyVault]: TAzureKeyVaultConnectionOption;
  [AppConnection.AzureAppConfiguration]: TAzureAppConfigurationConnectionOption;
  [AppConnection.AzureClientSecrets]: TAzureClientSecretsConnectionOption;
  [AppConnection.AzureDevOps]: TAzureDevOpsConnectionOption;
  [AppConnection.Databricks]: TDatabricksConnectionOption;
  [AppConnection.Humanitec]: THumanitecConnectionOption;
  [AppConnection.TerraformCloud]: TTerraformCloudConnectionOption;
  [AppConnection.Vercel]: TVercelConnectionOption;
  [AppConnection.Postgres]: TPostgresConnectionOption;
  [AppConnection.MsSql]: TMsSqlConnectionOption;
  [AppConnection.MySql]: TMySqlConnectionOption;
  [AppConnection.OracleDB]: TOracleDBConnectionOption;
  [AppConnection.Camunda]: TCamundaConnectionOption;
  [AppConnection.Windmill]: TWindmillConnectionOption;
  [AppConnection.Auth0]: TAuth0ConnectionOption;
  [AppConnection.HCVault]: THCVaultConnectionOption;
  [AppConnection.LDAP]: TLdapConnectionOption;
  [AppConnection.TeamCity]: TTeamCityConnectionOption;
  [AppConnection.OCI]: TOCIConnectionOption;
  [AppConnection.OnePass]: TOnePassConnectionOption;
  [AppConnection.Heroku]: THerokuConnectionOption;
  [AppConnection.Render]: TRenderConnectionOption;
  [AppConnection.Flyio]: TFlyioConnectionOption;
  [AppConnection.GitLab]: TGitlabConnectionOption;
  [AppConnection.Cloudflare]: TCloudflareConnectionOption;
  [AppConnection.DNSMadeEasy]: TDNSMadeEasyConnectionOption;
  [AppConnection.Bitbucket]: TBitbucketConnectionOption;
  [AppConnection.Zabbix]: TZabbixConnectionOption;
  [AppConnection.Railway]: TRailwayConnectionOption;
  [AppConnection.Checkly]: TChecklyConnectionOption;
  [AppConnection.Supabase]: TSupabaseConnectionOption;
  [AppConnection.DigitalOcean]: TDigitalOceanConnectionOption;
  [AppConnection.Netlify]: TNetlifyConnectionOption;
  [AppConnection.Northflank]: TNorthflankConnectionOption;
  [AppConnection.Okta]: TOktaConnectionOption;
  [AppConnection.AzureADCS]: TAzureAdCsConnectionOption;
  [AppConnection.Redis]: TRedisConnectionOption;
  [AppConnection.MongoDB]: TMongoDBConnectionOption;
  [AppConnection.LaravelForge]: TLaravelForgeConnectionOption;
  [AppConnection.Chef]: TChefConnectionOption;
  [AppConnection.OctopusDeploy]: TOctopusDeployConnectionOption;
};
