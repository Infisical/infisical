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
  DatabricksConnectionMethod,
  DbtConnectionMethod,
  DevinConnectionMethod,
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
  QoveryConnectionMethod,
  RedisConnectionMethod,
  TAppConnection,
  TeamCityConnectionMethod,
  TerraformCloudConnectionMethod,
  VercelConnectionMethod,
  WindmillConnectionMethod,
  ZabbixConnectionMethod
} from "@app/hooks/api/appConnections/types";
import { AdcsConnectionMethod } from "@app/hooks/api/appConnections/types/adcs-connection";
import { AnthropicConnectionMethod } from "@app/hooks/api/appConnections/types/anthropic-connection";
import { AzureDNSConnectionMethod } from "@app/hooks/api/appConnections/types/azure-dns-connection";
import { AzureEntraIdConnectionMethod } from "@app/hooks/api/appConnections/types/azure-entra-id-connection";
import { BitbucketConnectionMethod } from "@app/hooks/api/appConnections/types/bitbucket-connection";
import { ChecklyConnectionMethod } from "@app/hooks/api/appConnections/types/checkly-connection";
import { ChefConnectionMethod } from "@app/hooks/api/appConnections/types/chef-connection";
import { CircleCIConnectionMethod } from "@app/hooks/api/appConnections/types/circleci-connection";
import { Cloud66ConnectionMethod } from "@app/hooks/api/appConnections/types/cloud-66-connection";
import { ConvexConnectionMethod } from "@app/hooks/api/appConnections/types/convex-connection";
import { DatadogConnectionMethod } from "@app/hooks/api/appConnections/types/datadog-connection";
import { DigiCertConnectionMethod } from "@app/hooks/api/appConnections/types/digicert-connection";
import { DigitalOceanConnectionMethod } from "@app/hooks/api/appConnections/types/digital-ocean";
import { DNSMadeEasyConnectionMethod } from "@app/hooks/api/appConnections/types/dns-made-easy-connection";
import { DopplerConnectionMethod } from "@app/hooks/api/appConnections/types/doppler-connection";
import { ExternalInfisicalConnectionMethod } from "@app/hooks/api/appConnections/types/external-infisical-connection";
import { F5BigIpConnectionMethod } from "@app/hooks/api/appConnections/types/f5-big-ip-connection";
import { GoDaddyConnectionMethod } from "@app/hooks/api/appConnections/types/godaddy-connection";
import { HasuraCloudConnectionMethod } from "@app/hooks/api/appConnections/types/hasura-cloud-connection";
import { HerokuConnectionMethod } from "@app/hooks/api/appConnections/types/heroku-connection";
import { LaravelForgeConnectionMethod } from "@app/hooks/api/appConnections/types/laravel-forge-connection";
import { NetlifyConnectionMethod } from "@app/hooks/api/appConnections/types/netlify-connection";
import { NetScalerConnectionMethod } from "@app/hooks/api/appConnections/types/netscaler-connection";
import { NorthflankConnectionMethod } from "@app/hooks/api/appConnections/types/northflank-connection";
import { OCIConnectionMethod } from "@app/hooks/api/appConnections/types/oci-connection";
import { OnaConnectionMethod } from "@app/hooks/api/appConnections/types/ona-connection";
import { OpenRouterConnectionMethod } from "@app/hooks/api/appConnections/types/open-router-connection";
import { OVHConnectionMethod } from "@app/hooks/api/appConnections/types/ovh-connection";
import { RailwayConnectionMethod } from "@app/hooks/api/appConnections/types/railway-connection";
import { RenderConnectionMethod } from "@app/hooks/api/appConnections/types/render-connection";
import { SalesforceConnectionMethod } from "@app/hooks/api/appConnections/types/salesforce-connection";
import { SmbConnectionMethod } from "@app/hooks/api/appConnections/types/smb-connection";
import { SnowflakeConnectionMethod } from "@app/hooks/api/appConnections/types/snowflake-connection";
import { SshConnectionMethod } from "@app/hooks/api/appConnections/types/ssh-connection";
import { SupabaseConnectionMethod } from "@app/hooks/api/appConnections/types/supabase-connection";
import { TravisCIConnectionMethod } from "@app/hooks/api/appConnections/types/travis-ci-connection";
import { TriggerDevConnectionMethod } from "@app/hooks/api/appConnections/types/trigger-dev-connection";
import { VenafiConnectionMethod } from "@app/hooks/api/appConnections/types/venafi-connection";
import { VenafiTppConnectionMethod } from "@app/hooks/api/appConnections/types/venafi-tpp-connection";
import { IntegrationsListPageTabs } from "@app/types/integrations";

export const APP_CONNECTION_MAP: Record<
  AppConnection,
  {
    name: string;
    image: string;
    category: string;
    description: string;
    size?: number;
    icon?: IconDefinition;
    enterprise?: boolean;
    aliases?: string[];
  }
> = {
  [AppConnection.AWS]: {
    name: "AWS",
    image: "Amazon Web Services.png",
    category: "AWS",
    description: "Connect using IAM access keys or role assumption."
  },
  [AppConnection.GitHub]: {
    name: "GitHub",
    image: "GitHub.png",
    category: "VERSION CONTROL",
    description: "Authenticate via GitHub App, OAuth, or a personal access token."
  },
  [AppConnection.GitHubRadar]: {
    name: "GitHub Radar",
    image: "GitHub.png",
    icon: faBullseye,
    category: "SECURITY",
    description: "GitHub App connection used for secret scanning."
  },
  [AppConnection.GCP]: {
    name: "GCP",
    image: "Google Cloud Platform.png",
    category: "GOOGLE CLOUD",
    description: "Authenticate via service account impersonation."
  },
  [AppConnection.AzureKeyVault]: {
    name: "Azure Key Vault",
    image: "Microsoft Azure.png",
    category: "AZURE",
    description: "Cloud-managed keys, secrets, and certificates."
  },
  [AppConnection.AzureAppConfiguration]: {
    name: "Azure App Configuration",
    image: "Microsoft Azure.png",
    category: "AZURE",
    description: "Centralized application settings on Azure."
  },
  [AppConnection.AzureClientSecrets]: {
    name: "Azure Client Secrets",
    image: "Microsoft Azure.png",
    category: "AZURE",
    description: "Manage Entra ID application client secrets."
  },
  [AppConnection.AzureDevOps]: {
    name: "Azure DevOps",
    image: "Microsoft Azure.png",
    category: "AZURE",
    description: "Pipeline and project access for Azure DevOps."
  },
  [AppConnection.AzureADCS]: {
    name: "Azure ADCS (Web Enrollment)",
    image: "Microsoft Azure.png",
    category: "CERTIFICATES",
    description: "Issue certificates via Active Directory Certificate Services web enrollment."
  },
  [AppConnection.ADCS]: {
    name: "Microsoft ADCS",
    image: "Microsoft Azure.png",
    category: "CERTIFICATES",
    description: "Issue certificates via Active Directory Certificate Services over the Gateway."
  },
  [AppConnection.AzureDNS]: {
    name: "Azure DNS",
    image: "Microsoft Azure.png",
    category: "AZURE",
    description: "Manage DNS zones and records on Azure."
  },
  [AppConnection.Databricks]: {
    name: "Databricks",
    image: "Databricks.png",
    category: "DATA",
    description: "Workspace access for jobs, notebooks, and secrets."
  },
  [AppConnection.Humanitec]: {
    name: "Humanitec",
    image: "Humanitec.png",
    category: "PLATFORM",
    description: "Platform orchestrator for application configuration."
  },
  [AppConnection.TerraformCloud]: {
    name: "Terraform Cloud",
    image: "Terraform Cloud.png",
    category: "INFRASTRUCTURE",
    description: "Manage variables across Terraform Cloud workspaces."
  },
  [AppConnection.Vercel]: {
    name: "Vercel",
    image: "Vercel.png",
    category: "HOSTING",
    description: "Project and environment access for Vercel."
  },
  [AppConnection.Postgres]: {
    name: "PostgreSQL",
    image: "Postgres.png",
    category: "DATABASE",
    description: "Connect to a PostgreSQL database."
  },
  [AppConnection.MsSql]: {
    name: "Microsoft SQL Server",
    image: "MsSql.png",
    category: "DATABASE",
    description: "Connect to a Microsoft SQL Server database."
  },
  [AppConnection.MySql]: {
    name: "MySQL",
    image: "MySql.png",
    category: "DATABASE",
    description: "Connect to a MySQL database."
  },
  [AppConnection.OracleDB]: {
    name: "OracleDB",
    image: "Oracle.png",
    enterprise: true,
    category: "DATABASE",
    description: "Connect to an Oracle database."
  },
  [AppConnection.Camunda]: {
    name: "Camunda",
    image: "Camunda.png",
    category: "PLATFORM",
    description: "Cluster and client access for Camunda 8."
  },
  [AppConnection.Windmill]: {
    name: "Windmill",
    image: "Windmill.png",
    category: "PLATFORM",
    description: "Workspace access for Windmill scripts and flows."
  },
  [AppConnection.Auth0]: {
    name: "Auth0",
    image: "Auth0.png",
    size: 40,
    category: "IDENTITY",
    description: "Manage an Auth0 tenant via client credentials."
  },
  [AppConnection.HCVault]: {
    name: "Hashicorp Vault",
    image: "Vault.png",
    size: 65,
    category: "SECRET MANAGER",
    description: "Connect to a self-managed HashiCorp Vault."
  },
  [AppConnection.LDAP]: {
    name: "LDAP",
    image: "LDAP.png",
    size: 65,
    category: "IDENTITY",
    description: "Bind to an LDAP directory server."
  },
  [AppConnection.TeamCity]: {
    name: "TeamCity",
    image: "TeamCity.png",
    category: "CI/CD",
    description: "Project and build access for JetBrains TeamCity."
  },
  [AppConnection.OCI]: {
    name: "OCI",
    image: "Oracle.png",
    enterprise: true,
    category: "ORACLE CLOUD",
    description: "Authenticate to Oracle Cloud Infrastructure."
  },
  [AppConnection.OnePass]: {
    name: "1Password",
    image: "1Password.png",
    category: "PASSWORD MANAGER",
    description: "Read and manage items in 1Password vaults."
  },
  [AppConnection.Heroku]: {
    name: "Heroku",
    image: "Heroku.png",
    category: "HOSTING",
    description: "App and config var access for Heroku."
  },
  [AppConnection.Render]: {
    name: "Render",
    image: "Render.png",
    category: "HOSTING",
    description: "Service and environment access for Render."
  },
  [AppConnection.Flyio]: {
    name: "Fly.io",
    image: "Flyio.svg",
    category: "HOSTING",
    description: "App and secret access for Fly.io."
  },
  [AppConnection.GitLab]: {
    name: "GitLab",
    image: "GitLab.png",
    category: "VERSION CONTROL",
    description: "Authenticate via OAuth or an access token."
  },
  [AppConnection.Cloudflare]: {
    name: "Cloudflare",
    image: "Cloudflare.png",
    category: "NETWORKING",
    description: "Manage Cloudflare account resources via API token."
  },
  [AppConnection.DNSMadeEasy]: {
    name: "DNS Made Easy",
    image: "DNSMadeEasy.svg",
    size: 120,
    category: "DNS",
    description: "Manage DNS records on DNS Made Easy."
  },
  [AppConnection.Zabbix]: {
    name: "Zabbix",
    image: "Zabbix.png",
    category: "MONITORING",
    description: "Monitoring and host access for Zabbix."
  },
  [AppConnection.Railway]: {
    name: "Railway",
    image: "Railway.png",
    category: "HOSTING",
    description: "Project and environment access for Railway."
  },
  [AppConnection.Bitbucket]: {
    name: "Bitbucket",
    image: "Bitbucket.png",
    category: "VERSION CONTROL",
    description: "Repository and workspace access for Bitbucket."
  },
  [AppConnection.Checkly]: {
    name: "Checkly",
    image: "Checkly.png",
    category: "MONITORING",
    description: "Synthetic monitoring access for Checkly."
  },
  [AppConnection.Supabase]: {
    name: "Supabase",
    image: "Supabase.png",
    category: "PLATFORM",
    description: "Project access for the Supabase platform."
  },
  [AppConnection.DigitalOcean]: {
    name: "Digital Ocean",
    image: "Digital Ocean.png",
    category: "CLOUD",
    description: "Account and resource access for DigitalOcean."
  },
  [AppConnection.Netlify]: {
    name: "Netlify",
    image: "Netlify.png",
    category: "HOSTING",
    description: "Site and environment access for Netlify."
  },
  [AppConnection.Northflank]: {
    name: "Northflank",
    image: "Northflank.png",
    category: "HOSTING",
    description: "Project and service access for Northflank."
  },
  [AppConnection.Okta]: {
    name: "Okta",
    image: "Okta.png",
    category: "IDENTITY",
    description: "Manage an Okta org via API token."
  },
  [AppConnection.Redis]: {
    name: "Redis",
    image: "Redis.png",
    category: "DATABASE",
    description: "Connect to a Redis instance."
  },
  [AppConnection.MongoDB]: {
    name: "MongoDB",
    image: "MongoDB.png",
    category: "DATABASE",
    description: "Connect to a MongoDB database."
  },
  [AppConnection.LaravelForge]: {
    name: "Laravel Forge",
    image: "Laravel Forge.png",
    size: 65,
    category: "HOSTING",
    description: "Server and site access for Laravel Forge."
  },
  [AppConnection.Chef]: {
    name: "Chef",
    image: "Chef.png",
    enterprise: true,
    category: "INFRASTRUCTURE",
    description: "Node and data bag access for Chef Infra."
  },
  [AppConnection.OctopusDeploy]: {
    name: "Octopus Deploy",
    image: "Octopus Deploy.png",
    category: "CI/CD",
    description: "Project and deployment access for Octopus Deploy."
  },
  [AppConnection.SSH]: {
    name: "SSH",
    image: "SSH.png",
    category: "INFRASTRUCTURE",
    description: "Connect to a host over SSH."
  },
  [AppConnection.Dbt]: {
    name: "DBT",
    image: "DBT.png",
    category: "DATA",
    description: "Account and job access for dbt."
  },
  [AppConnection.SMB]: {
    name: "SMB",
    image: "SMB.png",
    size: 50,
    category: "STORAGE",
    description: "Connect to an SMB/CIFS file share."
  },
  [AppConnection.OpenRouter]: {
    name: "OpenRouter",
    image: "OpenRouter.png",
    category: "AI",
    description: "Route requests across LLM providers."
  },
  [AppConnection.CircleCI]: {
    name: "CircleCI",
    image: "CircleCI.png",
    category: "CI/CD",
    description: "Project and pipeline access for CircleCI."
  },
  [AppConnection.Cloud66]: {
    name: "Cloud 66",
    image: "Cloud 66.png",
    category: "HOSTING",
    description: "App and deployment access for Cloud 66."
  },
  [AppConnection.AzureEntraId]: {
    name: "Azure Entra ID",
    image: "Microsoft Azure.png",
    category: "IDENTITY",
    description: "Manage users and groups in Entra ID."
  },
  [AppConnection.Venafi]: {
    name: "Venafi TLS Protect Cloud",
    image: "Venafi.png",
    category: "CERTIFICATES",
    description: "Issue and manage certificates via Venafi Cloud."
  },
  [AppConnection.VenafiTpp]: {
    name: "Venafi TPP",
    image: "Venafi.png",
    category: "CERTIFICATES",
    description: "Issue certificates via Venafi Trust Protection Platform."
  },
  [AppConnection.ExternalInfisical]: {
    name: "Infisical",
    image: "Infisical.png",
    category: "SECRET MANAGER",
    description: "Connect to another Infisical instance."
  },
  [AppConnection.Doppler]: {
    name: "Doppler",
    image: "Doppler.png",
    category: "SECRET MANAGER",
    description: "Project and config access for Doppler."
  },
  [AppConnection.NetScaler]: {
    name: "NetScaler",
    image: "NetScaler.png",
    category: "NETWORKING",
    description: "Manage a Citrix NetScaler appliance."
  },
  [AppConnection.Anthropic]: {
    name: "Anthropic",
    image: "Anthropic.png",
    category: "AI",
    description: "Manage Anthropic API access."
  },
  [AppConnection.HasuraCloud]: {
    name: "Hasura Cloud",
    image: "Hasura.svg",
    category: "PLATFORM",
    description: "GraphQL API and data access for Hasura Cloud."
  },
  [AppConnection.OVH]: {
    name: "OVH Cloud",
    image: "OVH.png",
    category: "CLOUD",
    description: "Account and service access for OVHcloud."
  },
  [AppConnection.Devin]: {
    name: "Devin",
    image: "Devin.png",
    size: 55,
    category: "AI",
    description: "Manage Devin API access."
  },
  [AppConnection.Ona]: {
    name: "Ona",
    image: "Ona.png",
    aliases: ["gitpod"],
    category: "PLATFORM",
    description: "Workspace access for Ona (formerly Gitpod)."
  },
  [AppConnection.DigiCert]: {
    name: "DigiCert",
    image: "DigiCert.png",
    category: "CERTIFICATES",
    description: "Issue and manage certificates via DigiCert."
  },
  [AppConnection.GoDaddy]: {
    name: "GoDaddy",
    image: "GoDaddy.png",
    category: "DNS",
    description: "Manage DNS records on GoDaddy."
  },
  [AppConnection.TravisCI]: {
    name: "Travis CI",
    image: "Travis CI.png",
    category: "CI/CD",
    description: "Repository and build access for Travis CI."
  },
  [AppConnection.Salesforce]: {
    name: "Salesforce",
    image: "Salesforce.png",
    category: "CRM",
    description: "Org access via connected app client credentials."
  },
  [AppConnection.Snowflake]: {
    name: "Snowflake",
    image: "Snowflake.png",
    category: "DATA",
    description: "Connect to a Snowflake data warehouse."
  },
  [AppConnection.Datadog]: {
    name: "Datadog",
    image: "DatadogWhite.png",
    category: "MONITORING",
    description: "Metrics and monitoring access for Datadog."
  },
  [AppConnection.F5BigIp]: {
    name: "F5 BIG-IP",
    image: "F5 BIG-IP.png",
    category: "NETWORKING",
    description: "Manage an F5 BIG-IP appliance."
  },
  [AppConnection.Convex]: {
    name: "Convex",
    image: "Convex.png",
    category: "PLATFORM",
    description: "Project and deployment access for Convex."
  },
  [AppConnection.Qovery]: {
    name: "Qovery",
    image: "Qovery.png",
    category: "HOSTING",
    description: "Deploy and manage applications on Qovery."
  },
  [AppConnection.TriggerDev]: {
    name: "Trigger.dev",
    image: "TriggerDev.png",
    category: "INFRASTRUCTURE",
    description: "Trigger.dev access."
  }
};

export const POPULAR_APP_CONNECTIONS: AppConnection[] = [
  AppConnection.AWS,
  AppConnection.GitHub,
  AppConnection.GCP,
  AppConnection.AzureKeyVault,
  AppConnection.Postgres,
  AppConnection.Vercel
];

export const getAppConnectionMethodDetails = (method: TAppConnection["method"]) => {
  switch (method) {
    case GitHubConnectionMethod.App:
    case GitHubRadarConnectionMethod.App:
      return { name: "GitHub App", icon: faGithub };
    case GitHubConnectionMethod.Pat:
    case OnaConnectionMethod.PersonalAccessToken:
      return { name: "Personal Access Token", icon: faKey };
    case AzureKeyVaultConnectionMethod.OAuth:
    case AzureAppConfigurationConnectionMethod.OAuth:
    case AzureClientSecretsConnectionMethod.OAuth:
    case AzureDevOpsConnectionMethod.OAuth:
    case GitHubConnectionMethod.OAuth:
    case HerokuConnectionMethod.OAuth:
    case GitLabConnectionMethod.OAuth:
    case VenafiTppConnectionMethod.OAuth:
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
    case TravisCIConnectionMethod.ApiToken:
    case DopplerConnectionMethod.ApiToken:
      return { name: "API Token", icon: faKey };
    case VenafiConnectionMethod.ApiKey:
      return { name: "API Key", icon: faKey };
    case PostgresConnectionMethod.UsernameAndPassword:
    case MsSqlConnectionMethod.UsernameAndPassword:
    case MySqlConnectionMethod.UsernameAndPassword:
    case OracleDBConnectionMethod.UsernameAndPassword:
    case AzureADCSConnectionMethod.UsernamePassword:
    case AdcsConnectionMethod.UsernamePassword:
    case RedisConnectionMethod.UsernameAndPassword:
    case MongoDBConnectionMethod.UsernameAndPassword:
      return { name: "Username & Password", icon: faLock };
    case SnowflakeConnectionMethod.UsernameAndToken:
      return { name: "Username & Token", icon: faKey };
    case HCVaultConnectionMethod.AccessToken:
    case TeamCityConnectionMethod.AccessToken:
    case AzureDevOpsConnectionMethod.AccessToken:
    case WindmillConnectionMethod.AccessToken:
    case FlyioConnectionMethod.AccessToken:
    case NetlifyConnectionMethod.AccessToken:
    case ConvexConnectionMethod.PersonalAccessToken:
    case HasuraCloudConnectionMethod.AccessToken:
    case QoveryConnectionMethod.AccessToken:
    case Cloud66ConnectionMethod.AccessToken:
      return { name: "Personal Access Token", icon: faKey };
    case Auth0ConnectionMethod.ClientCredentials:
    case SalesforceConnectionMethod.ClientCredentials:
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
    case AnthropicConnectionMethod.ApiKey:
    case DevinConnectionMethod.ApiKey:
    case DigiCertConnectionMethod.ApiKey:
    case GoDaddyConnectionMethod.ApiKey:
    case TriggerDevConnectionMethod.ApiKey:
      return { name: "API Key", icon: faKey };
    case ChefConnectionMethod.UserKey:
      return { name: "User Key", icon: faKey };
    case AzureClientSecretsConnectionMethod.ClientSecret:
    case AzureAppConfigurationConnectionMethod.ClientSecret:
    case AzureKeyVaultConnectionMethod.ClientSecret:
    case AzureDevOpsConnectionMethod.ClientSecret:
      return { name: "Client Secret", icon: faKey };
    case AzureClientSecretsConnectionMethod.Certificate:
    case AzureKeyVaultConnectionMethod.Certificate:
      return { name: "Certificate", icon: faCertificate };
    case DNSMadeEasyConnectionMethod.APIKeySecret:
      return { name: "API Key & Secret", icon: faKey };
    case AzureDNSConnectionMethod.ClientSecret:
    case AzureEntraIdConnectionMethod.ClientSecret:
      return { name: "Client Secret", icon: faKey };
    case OctopusDeployConnectionMethod.ApiKey:
    case DatadogConnectionMethod.ApiKey:
      return { name: "API Key", icon: faKey };
    case SshConnectionMethod.Password:
      return { name: "Password", icon: faLock };
    case SshConnectionMethod.SshKey:
      return { name: "SSH Key", icon: faKey };
    case SmbConnectionMethod.Credentials:
      return { name: "Credentials", icon: faLock };
    case ExternalInfisicalConnectionMethod.MachineIdentityUniversalAuth:
      return { name: "Machine Identity - Universal Auth", icon: faKey };
    case NetScalerConnectionMethod.BasicAuth:
      return { name: "Basic Auth", icon: faLock };
    case OVHConnectionMethod.Certificate:
      return { name: "Certificate", icon: faCertificate };
    case F5BigIpConnectionMethod.BasicAuth:
      return { name: "Basic Auth", icon: faLock };
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

export const CSRF_TOKEN_STORAGE_KEY = "latestCSRFToken";
export const GITHUB_CONNECTION_FORM_STORAGE_KEY = "githubConnectionFormData";

export const buildGitHubHostUrl = (host?: string | null) =>
  host && host.trim().length > 0 ? `https://${host.trim()}` : "https://github.com";

export const buildGitHubAppUrl = (
  slug: string,
  host?: string | null,
  instanceType?: "cloud" | "server"
) => `${buildGitHubHostUrl(host)}/${instanceType === "server" ? "github-apps" : "apps"}/${slug}`;

export const buildGitHubAppInstallUrl = (
  slug: string,
  state: string,
  host?: string | null,
  instanceType?: "cloud" | "server"
) => `${buildGitHubAppUrl(slug, host, instanceType)}/installations/new?state=${state}`;

export const generateCsrfToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

export const consumeCsrfToken = (state: string) => {
  if (state !== localStorage.getItem(CSRF_TOKEN_STORAGE_KEY)) return false;
  localStorage.removeItem(CSRF_TOKEN_STORAGE_KEY);
  return true;
};

export const useGetAppConnectionOauthReturnUrl = () => {
  const {
    location: { pathname }
  } = useRouterState();

  return pathname;
};

export const getIntegrationsListTab = () => {
  if (localStorage.getItem("pkiSyncFormData")) return IntegrationsListPageTabs.PkiSyncs;
  if (localStorage.getItem("secretSyncFormData")) return IntegrationsListPageTabs.SecretSyncs;
  return IntegrationsListPageTabs.AppConnections;
};

export const getConnectionFlowReturnNavigateOptions = ({
  returnUrl,
  projectId,
  reopenFormApp
}: {
  returnUrl: string;
  projectId?: string;
  reopenFormApp?: AppConnection;
}) => {
  const search = {
    ...(reopenFormApp ? { addConnectionApp: reopenFormApp } : {}),
    ...(returnUrl.includes("integrations")
      ? {
          selectedTab: reopenFormApp
            ? IntegrationsListPageTabs.AppConnections
            : getIntegrationsListTab()
        }
      : {})
  };

  return {
    to: returnUrl,
    params: { projectId },
    search: Object.keys(search).length > 0 ? search : undefined
  };
};

export type TStoredConnectionFormData<T> =
  | { status: "ok"; data: T }
  | { status: "missing" }
  | { status: "corrupt" };

export const readConnectionFormData = <T>(storageKey: string): TStoredConnectionFormData<T> => {
  const raw = localStorage.getItem(storageKey);

  if (raw === null) return { status: "missing" };

  try {
    return { status: "ok", data: JSON.parse(raw) as T };
  } catch {
    localStorage.removeItem(storageKey);
    return { status: "corrupt" };
  }
};
