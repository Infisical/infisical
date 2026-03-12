import {
  TChefConnection,
  TChefConnectionConfig,
  TChefConnectionInput,
  TValidateChefConnectionCredentialsSchema
} from "@app/ee/services/app-connections/chef";
import {
  TOCIConnection,
  TOCIConnectionConfig,
  TOCIConnectionInput,
  TValidateOCIConnectionCredentialsSchema
} from "@app/ee/services/app-connections/oci";
import {
  TOracleDBConnection,
  TOracleDBConnectionInput,
  TValidateOracleDBConnectionCredentialsSchema
} from "@app/ee/services/app-connections/oracledb";
import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { TSqlConnectionConfig } from "@app/services/app-connection/shared/sql/sql-connection-types";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import {
  TOnePassConnection,
  TOnePassConnectionConfig,
  TOnePassConnectionInput,
  TValidateOnePassConnectionCredentialsSchema
} from "./1password";
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
  TAzureADCSConnection,
  TAzureADCSConnectionConfig,
  TAzureADCSConnectionInput,
  TValidateAzureADCSConnectionCredentialsSchema
} from "./azure-adcs/azure-adcs-connection-types";
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
  TAzureDevOpsConnection,
  TAzureDevOpsConnectionConfig,
  TAzureDevOpsConnectionInput,
  TValidateAzureDevOpsConnectionCredentialsSchema
} from "./azure-devops/azure-devops-types";
import {
  TAzureDnsConnection,
  TAzureDnsConnectionConfig,
  TAzureDnsConnectionInput,
  TValidateAzureDnsConnectionCredentialsSchema
} from "./azure-dns/azure-dns-connection-types";
import {
  TAzureKeyVaultConnection,
  TAzureKeyVaultConnectionConfig,
  TAzureKeyVaultConnectionInput,
  TValidateAzureKeyVaultConnectionCredentialsSchema
} from "./azure-key-vault";
import {
  TBitbucketConnection,
  TBitbucketConnectionConfig,
  TBitbucketConnectionInput,
  TValidateBitbucketConnectionCredentialsSchema
} from "./bitbucket";
import {
  TCamundaConnection,
  TCamundaConnectionConfig,
  TCamundaConnectionInput,
  TValidateCamundaConnectionCredentialsSchema
} from "./camunda";
import {
  TChecklyConnection,
  TChecklyConnectionConfig,
  TChecklyConnectionInput,
  TValidateChecklyConnectionCredentialsSchema
} from "./checkly";
import {
  TCircleCIConnection,
  TCircleCIConnectionConfig,
  TCircleCIConnectionInput,
  TValidateCircleCIConnectionCredentialsSchema
} from "./circleci";
import {
  TCloudflareConnection,
  TCloudflareConnectionConfig,
  TCloudflareConnectionInput,
  TValidateCloudflareConnectionCredentialsSchema
} from "./cloudflare/cloudflare-connection-types";
import {
  TDatabricksConnection,
  TDatabricksConnectionConfig,
  TDatabricksConnectionInput,
  TValidateDatabricksConnectionCredentialsSchema
} from "./databricks";
import {
  TDbtConnection,
  TDbtConnectionConfig,
  TDbtConnectionInput,
  TValidateDbtConnectionCredentialsSchema
} from "./dbt";
import {
  TDigitalOceanConnection,
  TDigitalOceanConnectionConfig,
  TDigitalOceanConnectionInput,
  TValidateDigitalOceanCredentialsSchema
} from "./digital-ocean";
import {
  TDNSMadeEasyConnection,
  TDNSMadeEasyConnectionConfig,
  TDNSMadeEasyConnectionInput,
  TValidateDNSMadeEasyConnectionCredentialsSchema
} from "./dns-made-easy/dns-made-easy-connection-types";
import {
  TFlyioConnection,
  TFlyioConnectionConfig,
  TFlyioConnectionInput,
  TValidateFlyioConnectionCredentialsSchema
} from "./flyio";
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
  TGitHubRadarConnection,
  TGitHubRadarConnectionConfig,
  TGitHubRadarConnectionInput,
  TValidateGitHubRadarConnectionCredentialsSchema
} from "./github-radar";
import {
  TGitLabConnection,
  TGitLabConnectionConfig,
  TGitLabConnectionInput,
  TValidateGitLabConnectionCredentialsSchema
} from "./gitlab";
import {
  THCVaultConnection,
  THCVaultConnectionConfig,
  THCVaultConnectionInput,
  TValidateHCVaultConnectionCredentialsSchema
} from "./hc-vault";
import {
  THerokuConnection,
  THerokuConnectionConfig,
  THerokuConnectionInput,
  TValidateHerokuConnectionCredentialsSchema
} from "./heroku";
import {
  THumanitecConnection,
  THumanitecConnectionConfig,
  THumanitecConnectionInput,
  TValidateHumanitecConnectionCredentialsSchema
} from "./humanitec";
import {
  TLaravelForgeConnection,
  TLaravelForgeConnectionConfig,
  TLaravelForgeConnectionInput,
  TValidateLaravelForgeConnectionCredentialsSchema
} from "./laravel-forge";
import {
  TLdapConnection,
  TLdapConnectionConfig,
  TLdapConnectionInput,
  TValidateLdapConnectionCredentialsSchema
} from "./ldap";
import {
  TMongoDBConnection,
  TMongoDBConnectionConfig,
  TMongoDBConnectionInput,
  TValidateMongoDBConnectionCredentialsSchema
} from "./mongodb";
import { TMsSqlConnection, TMsSqlConnectionInput, TValidateMsSqlConnectionCredentialsSchema } from "./mssql";
import { TMySqlConnection, TMySqlConnectionInput, TValidateMySqlConnectionCredentialsSchema } from "./mysql";
import {
  TNetlifyConnection,
  TNetlifyConnectionConfig,
  TNetlifyConnectionInput,
  TValidateNetlifyConnectionCredentialsSchema
} from "./netlify";
import {
  TNorthflankConnection,
  TNorthflankConnectionConfig,
  TNorthflankConnectionInput,
  TValidateNorthflankConnectionCredentialsSchema
} from "./northflank";
import {
  TOctopusDeployConnection,
  TOctopusDeployConnectionConfig,
  TOctopusDeployConnectionInput,
  TValidateOctopusDeployConnectionCredentialsSchema
} from "./octopus-deploy";
import {
  TOktaConnection,
  TOktaConnectionConfig,
  TOktaConnectionInput,
  TValidateOktaConnectionCredentialsSchema
} from "./okta";
import {
  TOpenRouterConnection,
  TOpenRouterConnectionConfig,
  TOpenRouterConnectionInput,
  TValidateOpenRouterConnectionCredentialsSchema
} from "./open-router";
import {
  TPostgresConnection,
  TPostgresConnectionInput,
  TValidatePostgresConnectionCredentialsSchema
} from "./postgres";
import {
  TRailwayConnection,
  TRailwayConnectionConfig,
  TRailwayConnectionInput,
  TValidateRailwayConnectionCredentialsSchema
} from "./railway";
import {
  TRedisConnection,
  TRedisConnectionConfig,
  TRedisConnectionInput,
  TValidateRedisConnectionCredentialsSchema
} from "./redis";
import {
  TKoyebConnection,
  TKoyebConnectionConfig,
  TKoyebConnectionInput,
  TValidateKoyebConnectionCredentialsSchema
} from "./koyeb/koyeb-connection-types";
import {
  TRenderConnection,
  TRenderConnectionConfig,
  TRenderConnectionInput,
  TValidateRenderConnectionCredentialsSchema
} from "./render/render-connection-types";
import {
  TSmbConnection,
  TSmbConnectionConfig,
  TSmbConnectionInput,
  TValidateSmbConnectionCredentialsSchema
} from "./smb";
import {
  TSshConnection,
  TSshConnectionConfig,
  TSshConnectionInput,
  TValidateSshConnectionCredentialsSchema
} from "./ssh";
import {
  TSupabaseConnection,
  TSupabaseConnectionConfig,
  TSupabaseConnectionInput,
  TValidateSupabaseConnectionCredentialsSchema
} from "./supabase";
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
import {
  TValidateZabbixConnectionCredentialsSchema,
  TZabbixConnection,
  TZabbixConnectionConfig,
  TZabbixConnectionInput
} from "./zabbix";

export type TAppConnection = { id: string } & (
  | TAwsConnection
  | TGitHubConnection
  | TGitHubRadarConnection
  | TGcpConnection
  | TAzureKeyVaultConnection
  | TAzureAppConfigurationConnection
  | TAzureDevOpsConnection
  | TAzureADCSConnection
  | TDatabricksConnection
  | THumanitecConnection
  | TTerraformCloudConnection
  | TVercelConnection
  | TPostgresConnection
  | TMsSqlConnection
  | TMySqlConnection
  | TCamundaConnection
  | TAzureClientSecretsConnection
  | TWindmillConnection
  | TAuth0Connection
  | THCVaultConnection
  | TLdapConnection
  | TTeamCityConnection
  | TOCIConnection
  | TOracleDBConnection
  | TOnePassConnection
  | THerokuConnection
  | TRenderConnection
  | TLaravelForgeConnection
  | TFlyioConnection
  | TGitLabConnection
  | TCloudflareConnection
  | TBitbucketConnection
  | TDNSMadeEasyConnection
  | TAzureDnsConnection
  | TZabbixConnection
  | TRailwayConnection
  | TChecklyConnection
  | TSupabaseConnection
  | TDigitalOceanConnection
  | TNetlifyConnection
  | TNorthflankConnection
  | TOktaConnection
  | TRedisConnection
  | TMongoDBConnection
  | TChefConnection
  | TOctopusDeployConnection
  | TSshConnection
  | TDbtConnection
  | TSmbConnection
  | TOpenRouterConnection
  | TCircleCIConnection
  | TKoyebConnection
);

export type TAppConnectionRaw = NonNullable<Awaited<ReturnType<TAppConnectionDALFactory["findById"]>>>;

export type TSqlConnection = TPostgresConnection | TMsSqlConnection | TMySqlConnection | TOracleDBConnection;

export type TAppConnectionInput = { id: string } & (
  | TAwsConnectionInput
  | TGitHubConnectionInput
  | TGitHubRadarConnectionInput
  | TGcpConnectionInput
  | TAzureKeyVaultConnectionInput
  | TAzureAppConfigurationConnectionInput
  | TAzureDevOpsConnectionInput
  | TAzureADCSConnectionInput
  | TDatabricksConnectionInput
  | THumanitecConnectionInput
  | TTerraformCloudConnectionInput
  | TVercelConnectionInput
  | TPostgresConnectionInput
  | TMsSqlConnectionInput
  | TMySqlConnectionInput
  | TCamundaConnectionInput
  | TAzureClientSecretsConnectionInput
  | TWindmillConnectionInput
  | TAuth0ConnectionInput
  | THCVaultConnectionInput
  | TLdapConnectionInput
  | TTeamCityConnectionInput
  | TOCIConnectionInput
  | TOracleDBConnectionInput
  | TOnePassConnectionInput
  | THerokuConnectionInput
  | TRenderConnectionInput
  | TLaravelForgeConnectionInput
  | TFlyioConnectionInput
  | TGitLabConnectionInput
  | TCloudflareConnectionInput
  | TBitbucketConnectionInput
  | TDNSMadeEasyConnectionInput
  | TAzureDnsConnectionInput
  | TZabbixConnectionInput
  | TRailwayConnectionInput
  | TChecklyConnectionInput
  | TSupabaseConnectionInput
  | TDigitalOceanConnectionInput
  | TNetlifyConnectionInput
  | TNorthflankConnectionInput
  | TOktaConnectionInput
  | TRedisConnectionInput
  | TMongoDBConnectionInput
  | TChefConnectionInput
  | TOctopusDeployConnectionInput
  | TSshConnectionInput
  | TDbtConnectionInput
  | TSmbConnectionInput
  | TOpenRouterConnectionInput
  | TCircleCIConnectionInput
  | TKoyebConnectionInput
);

export type TSqlConnectionInput =
  | TPostgresConnectionInput
  | TMsSqlConnectionInput
  | TMySqlConnectionInput
  | TOracleDBConnectionInput;

export type TCreateAppConnectionDTO = Pick<
  TAppConnectionInput,
  "credentials" | "method" | "name" | "app" | "description" | "isPlatformManagedCredentials" | "gatewayId" | "projectId"
>;

export type TUpdateAppConnectionDTO = Partial<Omit<TCreateAppConnectionDTO, "method" | "app" | "projectId">> & {
  connectionId: string;
};

export type TGetAppConnectionByNameDTO = {
  connectionName: string;
  projectId?: string;
};

export type TValidateAppConnectionUsageByIdDTO = {
  connectionId: string;
  projectId: string;
};

export type TAppConnectionConfig =
  | TAwsConnectionConfig
  | TGitHubConnectionConfig
  | TGitHubRadarConnectionConfig
  | TGcpConnectionConfig
  | TAzureKeyVaultConnectionConfig
  | TAzureAppConfigurationConnectionConfig
  | TAzureDevOpsConnectionConfig
  | TAzureADCSConnectionConfig
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
  | TTeamCityConnectionConfig
  | TOCIConnectionConfig
  | TOnePassConnectionConfig
  | THerokuConnectionConfig
  | TRenderConnectionConfig
  | TLaravelForgeConnectionConfig
  | TFlyioConnectionConfig
  | TGitLabConnectionConfig
  | TCloudflareConnectionConfig
  | TBitbucketConnectionConfig
  | TDNSMadeEasyConnectionConfig
  | TAzureDnsConnectionConfig
  | TZabbixConnectionConfig
  | TRailwayConnectionConfig
  | TChecklyConnectionConfig
  | TSupabaseConnectionConfig
  | TDigitalOceanConnectionConfig
  | TNetlifyConnectionConfig
  | TNorthflankConnectionConfig
  | TOktaConnectionConfig
  | TRedisConnectionConfig
  | TMongoDBConnectionConfig
  | TChefConnectionConfig
  | TOctopusDeployConnectionConfig
  | TSshConnectionConfig
  | TDbtConnectionConfig
  | TSmbConnectionConfig
  | TOpenRouterConnectionConfig
  | TCircleCIConnectionConfig
  | TKoyebConnectionConfig;

export type TValidateAppConnectionCredentialsSchema =
  | TValidateAwsConnectionCredentialsSchema
  | TValidateGitHubConnectionCredentialsSchema
  | TValidateGitHubRadarConnectionCredentialsSchema
  | TValidateGcpConnectionCredentialsSchema
  | TValidateAzureKeyVaultConnectionCredentialsSchema
  | TValidateAzureAppConfigurationConnectionCredentialsSchema
  | TValidateAzureClientSecretsConnectionCredentialsSchema
  | TValidateAzureDevOpsConnectionCredentialsSchema
  | TValidateAzureADCSConnectionCredentialsSchema
  | TValidateDatabricksConnectionCredentialsSchema
  | TValidateHumanitecConnectionCredentialsSchema
  | TValidatePostgresConnectionCredentialsSchema
  | TValidateMsSqlConnectionCredentialsSchema
  | TValidateMySqlConnectionCredentialsSchema
  | TValidateCamundaConnectionCredentialsSchema
  | TValidateVercelConnectionCredentialsSchema
  | TValidateTerraformCloudConnectionCredentialsSchema
  | TValidateWindmillConnectionCredentialsSchema
  | TValidateAuth0ConnectionCredentialsSchema
  | TValidateHCVaultConnectionCredentialsSchema
  | TValidateLdapConnectionCredentialsSchema
  | TValidateTeamCityConnectionCredentialsSchema
  | TValidateOCIConnectionCredentialsSchema
  | TValidateOracleDBConnectionCredentialsSchema
  | TValidateOnePassConnectionCredentialsSchema
  | TValidateHerokuConnectionCredentialsSchema
  | TValidateRenderConnectionCredentialsSchema
  | TValidateLaravelForgeConnectionCredentialsSchema
  | TValidateFlyioConnectionCredentialsSchema
  | TValidateGitLabConnectionCredentialsSchema
  | TValidateCloudflareConnectionCredentialsSchema
  | TValidateBitbucketConnectionCredentialsSchema
  | TValidateDNSMadeEasyConnectionCredentialsSchema
  | TValidateAzureDnsConnectionCredentialsSchema
  | TValidateZabbixConnectionCredentialsSchema
  | TValidateRailwayConnectionCredentialsSchema
  | TValidateChecklyConnectionCredentialsSchema
  | TValidateSupabaseConnectionCredentialsSchema
  | TValidateDigitalOceanCredentialsSchema
  | TValidateNetlifyConnectionCredentialsSchema
  | TValidateNorthflankConnectionCredentialsSchema
  | TValidateOktaConnectionCredentialsSchema
  | TValidateRedisConnectionCredentialsSchema
  | TValidateMongoDBConnectionCredentialsSchema
  | TValidateChefConnectionCredentialsSchema
  | TValidateOctopusDeployConnectionCredentialsSchema
  | TValidateSshConnectionCredentialsSchema
  | TValidateDbtConnectionCredentialsSchema
  | TValidateSmbConnectionCredentialsSchema
  | TValidateOpenRouterConnectionCredentialsSchema
  | TValidateCircleCIConnectionCredentialsSchema
  | TValidateKoyebConnectionCredentialsSchema;

export type TListAwsConnectionKmsKeys = {
  connectionId: string;
  region: AWSRegion;
  destination: SecretSync.AWSParameterStore | SecretSync.AWSSecretsManager;
};

export type TListAwsConnectionIamUsers = {
  connectionId: string;
};

export type TListAwsConnectionLoadBalancers = {
  connectionId: string;
  region: AWSRegion;
};

export type TListAwsConnectionListeners = {
  connectionId: string;
  region: AWSRegion;
  loadBalancerArn: string;
};

export type TAppConnectionCredentialsValidator = (
  appConnection: TAppConnectionConfig,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => Promise<TAppConnection["credentials"]>;

export type TAppConnectionTransitionCredentialsToPlatform = (
  appConnection: TAppConnectionConfig,
  callback: (credentials: TAppConnection["credentials"]) => Promise<TAppConnectionRaw>,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => Promise<TAppConnectionRaw>;

export type TAppConnectionBaseConfig = {
  supportsPlatformManagedCredentials?: boolean;
  supportsGateways?: boolean;
};
