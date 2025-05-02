import { faGithub } from "@fortawesome/free-brands-svg-icons";
import {
  faKey,
  faLink,
  faLock,
  faPassport,
  faServer,
  faUser
} from "@fortawesome/free-solid-svg-icons";

import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  Auth0ConnectionMethod,
  AwsConnectionMethod,
  AzureAppConfigurationConnectionMethod,
  AzureClientSecretsConnectionMethod,
  AzureKeyVaultConnectionMethod,
  CamundaConnectionMethod,
  DatabricksConnectionMethod,
  GcpConnectionMethod,
  GitHubConnectionMethod,
  HCVaultConnectionMethod,
  HumanitecConnectionMethod,
  LdapConnectionMethod,
  MsSqlConnectionMethod,
  PostgresConnectionMethod,
  TAppConnection,
  TeamCityConnectionMethod,
  TerraformCloudConnectionMethod,
  VercelConnectionMethod,
  WindmillConnectionMethod
} from "@app/hooks/api/appConnections/types";

export const APP_CONNECTION_MAP: Record<
  AppConnection,
  { name: string; image: string; size?: number }
> = {
  [AppConnection.AWS]: { name: "AWS", image: "Amazon Web Services.png" },
  [AppConnection.GitHub]: { name: "GitHub", image: "GitHub.png" },
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
  [AppConnection.Databricks]: { name: "Databricks", image: "Databricks.png" },
  [AppConnection.Humanitec]: { name: "Humanitec", image: "Humanitec.png" },
  [AppConnection.TerraformCloud]: { name: "Terraform Cloud", image: "Terraform Cloud.png" },
  [AppConnection.Vercel]: { name: "Vercel", image: "Vercel.png" },
  [AppConnection.Postgres]: { name: "PostgreSQL", image: "Postgres.png" },
  [AppConnection.MsSql]: { name: "Microsoft SQL Server", image: "MsSql.png" },
  [AppConnection.Camunda]: { name: "Camunda", image: "Camunda.png" },
  [AppConnection.Windmill]: { name: "Windmill", image: "Windmill.png" },
  [AppConnection.Auth0]: { name: "Auth0", image: "Auth0.png", size: 40 },
  [AppConnection.HCVault]: { name: "Hashicorp Vault", image: "Vault.png", size: 65 },
  [AppConnection.LDAP]: { name: "LDAP", image: "LDAP.png", size: 65 },
  [AppConnection.TeamCity]: { name: "TeamCity", image: "TeamCity.png" }
};

export const getAppConnectionMethodDetails = (method: TAppConnection["method"]) => {
  switch (method) {
    case GitHubConnectionMethod.App:
      return { name: "GitHub App", icon: faGithub };
    case AzureKeyVaultConnectionMethod.OAuth:
    case AzureAppConfigurationConnectionMethod.OAuth:
    case AzureClientSecretsConnectionMethod.OAuth:
    case GitHubConnectionMethod.OAuth:
      return { name: "OAuth", icon: faPassport };
    case AwsConnectionMethod.AccessKey:
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
      return { name: "API Token", icon: faKey };
    case PostgresConnectionMethod.UsernameAndPassword:
    case MsSqlConnectionMethod.UsernameAndPassword:
      return { name: "Username & Password", icon: faLock };
    case HCVaultConnectionMethod.AccessToken:
    case TeamCityConnectionMethod.AccessToken:
    case WindmillConnectionMethod.AccessToken:
      return { name: "Access Token", icon: faKey };
    case Auth0ConnectionMethod.ClientCredentials:
      return { name: "Client Credentials", icon: faServer };
    case HCVaultConnectionMethod.AppRole:
      return { name: "App Role", icon: faUser };
    case LdapConnectionMethod.SimpleBind:
      return { name: "Simple Bind", icon: faLink };
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
