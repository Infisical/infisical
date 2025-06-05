import { faGithub, IconDefinition } from "@fortawesome/free-brands-svg-icons";
import {
  faBullseye,
  faCertificate,
  faKey,
  faLink,
  faLock,
  faPassport,
  faServer,
  faUser
} from "@fortawesome/free-solid-svg-icons";
import { useRouterState } from "@tanstack/react-router";

import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  Auth0ConnectionMethod,
  AwsConnectionMethod,
  AzureADCSConnectionMethod,
  AzureAppConfigurationConnectionMethod,
  AzureClientSecretsConnectionMethod,
  AzureDevOpsConnectionMethod,
  AzureKeyVaultConnectionMethod,
  CamundaConnectionMethod,
  CloudflareConnectionMethod,
  CoolifyConnectionMethod,
  DatabricksConnectionMethod,
  DbtConnectionMethod,
  FlyioConnectionMethod,
  GcpConnectionMethod,
  GitHubConnectionMethod,
  GitHubRadarConnectionMethod,
  GitLabConnectionMethod,
  HCVaultConnectionMethod,
  HumanitecConnectionMethod,
  LdapConnectionMethod,
  MongoDBConnectionMethod,
  MsSqlConnectionMethod,
  MySqlConnectionMethod,
  OctopusDeployConnectionMethod,
  OktaConnectionMethod,
  OnePassConnectionMethod,
  OracleDBConnectionMethod,
  PostgresConnectionMethod,
  RedisConnectionMethod,
  TAppConnection,
  TeamCityConnectionMethod,
  TerraformCloudConnectionMethod,
  VercelConnectionMethod,
  WindmillConnectionMethod,
  ZabbixConnectionMethod
} from "@app/hooks/api/appConnections/types";
import { BitbucketConnectionMethod } from "@app/hooks/api/appConnections/types/bitbucket-connection";
import { ChecklyConnectionMethod } from "@app/hooks/api/appConnections/types/checkly-connection";
import { ChefConnectionMethod } from "@app/hooks/api/appConnections/types/chef-connection";
import { CircleCIConnectionMethod } from "@app/hooks/api/appConnections/types/circleci-connection";
import { DigitalOceanConnectionMethod } from "@app/hooks/api/appConnections/types/digital-ocean";
import { DNSMadeEasyConnectionMethod } from "@app/hooks/api/appConnections/types/dns-made-easy-connection";
import { HerokuConnectionMethod } from "@app/hooks/api/appConnections/types/heroku-connection";
import { LaravelForgeConnectionMethod } from "@app/hooks/api/appConnections/types/laravel-forge-connection";
import { NetlifyConnectionMethod } from "@app/hooks/api/appConnections/types/netlify-connection";
import { NorthflankConnectionMethod } from "@app/hooks/api/appConnections/types/northflank-connection";
import { OCIConnectionMethod } from "@app/hooks/api/appConnections/types/oci-connection";
import { OpenRouterConnectionMethod } from "@app/hooks/api/appConnections/types/open-router-connection";
import { RailwayConnectionMethod } from "@app/hooks/api/appConnections/types/railway-connection";
import { RenderConnectionMethod } from "@app/hooks/api/appConnections/types/render-connection";
import { SmbConnectionMethod } from "@app/hooks/api/appConnections/types/smb-connection";
import { SshConnectionMethod } from "@app/hooks/api/appConnections/types/ssh-connection";
import { SupabaseConnectionMethod } from "@app/hooks/api/appConnections/types/supabase-connection";

export const APP_CONNECTION_MAP: Record<
  AppConnection,
  {
    name: string;
    image: string;
    size?: number;
    icon?: IconDefinition;
    enterprise?: boolean;
  }
> = {
  [AppConnection.AWS]: { name: "AWS", image: "Amazon Web Services.png" },
  [AppConnection.GitHub]: { name: "GitHub", image: "GitHub.png" },
  [AppConnection.GitHubRadar]: {
    name: "GitHub Radar",
    image: "GitHub.png",
    icon: faBullseye
  },
  [AppConnection.GCP]: {
    name: "GCP",
    image: "Google Cloud Platform.png"
  },
  [AppConnection.AzureKeyVault]: { name: "Azure Key Vault", image: "Microsoft Azure.png" },
  [AppConnection.AzureAppConfiguration]: {
    name: "Azure App Configuration",
    image: "Microsoft Azure.png"
  },
  [AppConnection.AzureClientSecrets]: {
    name: "Azure Client Secrets",
    image: "Microsoft Azure.png"
  },
  [AppConnection.AzureDevOps]: { name: "Azure DevOps", image: "Microsoft Azure.png" },
  [AppConnection.AzureADCS]: { name: "Azure ADCS", image: "Microsoft Azure.png" },
  [AppConnection.Databricks]: { name: "Databricks", image: "Databricks.png" },
  [AppConnection.Humanitec]: { name: "Humanitec", image: "Humanitec.png" },
  [AppConnection.TerraformCloud]: { name: "Terraform Cloud", image: "Terraform Cloud.png" },
  [AppConnection.Vercel]: { name: "Vercel", image: "Vercel.png" },
  [AppConnection.Postgres]: { name: "PostgreSQL", image: "Postgres.png" },
  [AppConnection.MsSql]: { name: "Microsoft SQL Server", image: "MsSql.png" },
  [AppConnection.MySql]: { name: "MySQL", image: "MySql.png" },
  [AppConnection.OracleDB]: { name: "OracleDB", image: "Oracle.png", enterprise: true },
  [AppConnection.Camunda]: { name: "Camunda", image: "Camunda.png" },
  [AppConnection.Windmill]: { name: "Windmill", image: "Windmill.png" },
  [AppConnection.Auth0]: { name: "Auth0", image: "Auth0.png", size: 40 },
  [AppConnection.HCVault]: { name: "Hashicorp Vault", image: "Vault.png", size: 65 },
  [AppConnection.LDAP]: { name: "LDAP", image: "LDAP.png", size: 65 },
  [AppConnection.TeamCity]: { name: "TeamCity", image: "TeamCity.png" },
  [AppConnection.OCI]: { name: "OCI", image: "Oracle.png", enterprise: true },
  [AppConnection.OnePass]: { name: "1Password", image: "1Password.png" },
  [AppConnection.Heroku]: { name: "Heroku", image: "Heroku.png" },
  [AppConnection.Render]: { name: "Render", image: "Render.png" },
  [AppConnection.Flyio]: { name: "Fly.io", image: "Flyio.svg" },
  [AppConnection.GitLab]: { name: "GitLab", image: "GitLab.png" },
  [AppConnection.Cloudflare]: { name: "Cloudflare", image: "Cloudflare.png" },
  [AppConnection.DNSMadeEasy]: { name: "DNS Made Easy", image: "DNSMadeEasy.svg", size: 120 },
  [AppConnection.Zabbix]: { name: "Zabbix", image: "Zabbix.png" },
  [AppConnection.Railway]: { name: "Railway", image: "Railway.png" },
  [AppConnection.Bitbucket]: { name: "Bitbucket", image: "Bitbucket.png" },
  [AppConnection.Checkly]: { name: "Checkly", image: "Checkly.png" },
  [AppConnection.Supabase]: { name: "Supabase", image: "Supabase.png" },
  [AppConnection.DigitalOcean]: {
    name: "Digital Ocean",
    image: "Digital Ocean.png"
  },
  [AppConnection.Netlify]: {
    name: "Netlify",
    image: "Netlify.png"
  },
  [AppConnection.Northflank]: { name: "Northflank", image: "Northflank.png" },
  [AppConnection.Okta]: { name: "Okta", image: "Okta.png" },
  [AppConnection.Redis]: { name: "Redis", image: "Redis.png" },
  [AppConnection.MongoDB]: { name: "MongoDB", image: "MongoDB.png" },
  [AppConnection.LaravelForge]: {
    name: "Laravel Forge",
    image: "Laravel Forge.png",
    size: 65
  },
  [AppConnection.Chef]: { name: "Chef", image: "Chef.png", enterprise: true },
  [AppConnection.OctopusDeploy]: { name: "Octopus Deploy", image: "Octopus Deploy.png" },
  [AppConnection.SSH]: { name: "SSH", image: "SSH.png" },
  [AppConnection.Dbt]: { name: "DBT", image: "DBT.png" },
  [AppConnection.SMB]: { name: "SMB", image: "SMB.png", size: 50 },
  [AppConnection.OpenRouter]: { name: "OpenRouter", image: "OpenRouter.png" },
  [AppConnection.CircleCI]: { name: "CircleCI", image: "CircleCI.png" },
  [AppConnection.Coolify]: { name: "Coolify", image: "Coolify.png" }
};

export const getAppConnectionMethodDetails = (method: TAppConnection["method"]) => {
  switch (method) {
    case GitHubConnectionMethod.App:
    case GitHubRadarConnectionMethod.App:
      return { name: "GitHub App", icon: faGithub };
    case GitHubConnectionMethod.Pat:
      return { name: "Personal Access Token", icon: faKey };
    case AzureKeyVaultConnectionMethod.OAuth:
    case AzureAppConfigurationConnectionMethod.OAuth:
    case AzureClientSecretsConnectionMethod.OAuth:
    case AzureDevOpsConnectionMethod.OAuth:
    case GitHubConnectionMethod.OAuth:
    case HerokuConnectionMethod.OAuth:
    case GitLabConnectionMethod.OAuth:
      return { name: "OAuth", icon: faPassport };
    case AwsConnectionMethod.AccessKey:
    case OCIConnectionMethod.AccessKey:
      return { name: "Access Key", icon: faKey };
    case AwsConnectionMethod.AssumeRole:
      return { name: "Assume Role", icon: faUser };
    case GcpConnectionMethod.ServiceAccountImpersonation:
      return { name: "Service Account Impersonation", icon: faUser };
    case DatabricksConnectionMethod.ServicePrincipal:
      return { name: "Service Principal", icon: faUser };
    case CamundaConnectionMethod.ClientCredentials:
      return { name: "Client Credentials", icon: faKey };
    case HumanitecConnectionMethod.ApiToken:
    case TerraformCloudConnectionMethod.ApiToken:
    case VercelConnectionMethod.ApiToken:
    case OnePassConnectionMethod.ApiToken:
    case CloudflareConnectionMethod.ApiToken:
    case BitbucketConnectionMethod.ApiToken:
    case ZabbixConnectionMethod.ApiToken:
    case DigitalOceanConnectionMethod.ApiToken:
    case NorthflankConnectionMethod.ApiToken:
    case OktaConnectionMethod.ApiToken:
    case LaravelForgeConnectionMethod.ApiToken:
    case DbtConnectionMethod.ApiToken:
    case CircleCIConnectionMethod.ApiToken:
    case CoolifyConnectionMethod.ApiToken:
      return { name: "API Token", icon: faKey };
    case PostgresConnectionMethod.UsernameAndPassword:
    case MsSqlConnectionMethod.UsernameAndPassword:
    case MySqlConnectionMethod.UsernameAndPassword:
    case OracleDBConnectionMethod.UsernameAndPassword:
    case AzureADCSConnectionMethod.UsernamePassword:
    case RedisConnectionMethod.UsernameAndPassword:
    case MongoDBConnectionMethod.UsernameAndPassword:
      return { name: "Username & Password", icon: faLock };
    case HCVaultConnectionMethod.AccessToken:
    case TeamCityConnectionMethod.AccessToken:
    case AzureDevOpsConnectionMethod.AccessToken:
    case WindmillConnectionMethod.AccessToken:
    case FlyioConnectionMethod.AccessToken:
    case NetlifyConnectionMethod.AccessToken:
      return { name: "Access Token", icon: faKey };
    case Auth0ConnectionMethod.ClientCredentials:
      return { name: "Client Credentials", icon: faServer };
    case HCVaultConnectionMethod.AppRole:
      return { name: "App Role", icon: faUser };
    case LdapConnectionMethod.SimpleBind:
      return { name: "Simple Bind", icon: faLink };
    case HerokuConnectionMethod.AuthToken:
      return { name: "Auth Token", icon: faKey };
    case RailwayConnectionMethod.AccountToken:
    case SupabaseConnectionMethod.AccessToken:
      return { name: "Account Token", icon: faKey };
    case RailwayConnectionMethod.TeamToken:
      return { name: "Team Token", icon: faKey };
    case RailwayConnectionMethod.ProjectToken:
      return { name: "Project Token", icon: faKey };
    case RenderConnectionMethod.ApiKey:
    case ChecklyConnectionMethod.ApiKey:
    case OpenRouterConnectionMethod.ApiKey:
      return { name: "API Key", icon: faKey };
    case ChefConnectionMethod.UserKey:
      return { name: "User Key", icon: faKey };
    case AzureClientSecretsConnectionMethod.ClientSecret:
    case AzureAppConfigurationConnectionMethod.ClientSecret:
    case AzureKeyVaultConnectionMethod.ClientSecret:
    case AzureDevOpsConnectionMethod.ClientSecret:
      return { name: "Client Secret", icon: faKey };
    case AzureClientSecretsConnectionMethod.Certificate:
      return { name: "Certificate", icon: faCertificate };
    case DNSMadeEasyConnectionMethod.APIKeySecret:
      return { name: "API Key & Secret", icon: faKey };
    case OctopusDeployConnectionMethod.ApiKey:
      return { name: "API Key", icon: faKey };
    case SshConnectionMethod.Password:
      return { name: "Password", icon: faLock };
    case SshConnectionMethod.SshKey:
      return { name: "SSH Key", icon: faKey };
    case SmbConnectionMethod.Credentials:
      return { name: "Credentials", icon: faLock };
    default:
      throw new Error(`Unhandled App Connection Method: ${method}`);
  }
};

export const AWS_REGIONS = [
  { name: "US East (Ohio)", slug: "us-east-2" },
  { name: "US East (N. Virginia)", slug: "us-east-1" },
  { name: "US West (N. California)", slug: "us-west-1" },
  { name: "US West (Oregon)", slug: "us-west-2" },
  { name: "Africa (Cape Town)", slug: "af-south-1" },
  { name: "Asia Pacific (Hong Kong)", slug: "ap-east-1" },
  { name: "Asia Pacific (Hyderabad)", slug: "ap-south-2" },
  { name: "Asia Pacific (Jakarta)", slug: "ap-southeast-3" },
  { name: "Asia Pacific (Melbourne)", slug: "ap-southeast-4" },
  { name: "Asia Pacific (Mumbai)", slug: "ap-south-1" },
  { name: "Asia Pacific (Osaka)", slug: "ap-northeast-3" },
  { name: "Asia Pacific (Seoul)", slug: "ap-northeast-2" },
  { name: "Asia Pacific (Singapore)", slug: "ap-southeast-1" },
  { name: "Asia Pacific (Sydney)", slug: "ap-southeast-2" },
  { name: "Asia Pacific (Tokyo)", slug: "ap-northeast-1" },
  { name: "Canada (Central)", slug: "ca-central-1" },
  { name: "Europe (Frankfurt)", slug: "eu-central-1" },
  { name: "Europe (Ireland)", slug: "eu-west-1" },
  { name: "Europe (London)", slug: "eu-west-2" },
  { name: "Europe (Milan)", slug: "eu-south-1" },
  { name: "Europe (Paris)", slug: "eu-west-3" },
  { name: "Europe (Spain)", slug: "eu-south-2" },
  { name: "Europe (Stockholm)", slug: "eu-north-1" },
  { name: "Europe (Zurich)", slug: "eu-central-2" },
  { name: "Middle East (Bahrain)", slug: "me-south-1" },
  { name: "Middle East (UAE)", slug: "me-central-1" },
  { name: "South America (Sao Paulo)", slug: "sa-east-1" },
  { name: "AWS GovCloud (US-East)", slug: "us-gov-east-1" },
  { name: "AWS GovCloud (US-West)", slug: "us-gov-west-1" }
];

export const useGetAppConnectionOauthReturnUrl = () => {
  const {
    location: { pathname }
  } = useRouterState();

  return pathname;
};
