import type { TAuth0Client } from "@app/hooks/api/appConnections/auth0/types";
import type {
  TAwsConnectionIamUser,
  TAwsConnectionKmsKey,
  TListAwsConnectionKmsKeys
} from "@app/hooks/api/appConnections/aws/types";
import type { TAzureClient } from "@app/hooks/api/appConnections/azure/types";
import type {
  TCloudflarePermissionGroup,
  TCloudflareR2Bucket,
  TCloudflareZone
} from "@app/hooks/api/appConnections/cloudflare/types";
import type { TDatabricksServicePrincipal } from "@app/hooks/api/appConnections/databricks/types";
import type { TDatadogServiceAccount } from "@app/hooks/api/appConnections/datadog/types";
import type { TDbtProject } from "@app/hooks/api/appConnections/dbt/types";
import type { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TFireworksServiceAccount } from "@app/hooks/api/appConnections/fireworks/types";
import type {
  TGcpLocation,
  TGcpProject,
  TListProjectLocations
} from "@app/hooks/api/appConnections/gcp/types";
import type {
  TGitHubConnectionEnvironment,
  TGitHubConnectionOrganization,
  TGitHubConnectionRepository,
  TListGitHubConnectionEnvironments
} from "@app/hooks/api/appConnections/github/types";
import type {
  TLiteLLMModel,
  TLiteLLMTeam,
  TLiteLLMUser
} from "@app/hooks/api/appConnections/litellm/types";
import type { TOktaApp } from "@app/hooks/api/appConnections/okta/types";
import type { TOpenRouterWorkspace } from "@app/hooks/api/appConnections/open-router/types";
import type { TOpenAIProject } from "@app/hooks/api/appConnections/openai/types";
import type { TSalesforceOauthApp } from "@app/hooks/api/appConnections/salesforce/types";
import type { TSnowflakeUser } from "@app/hooks/api/appConnections/snowflake/types";
import type { TSupabaseProject } from "@app/hooks/api/appConnections/supabase/types";
import type { TAvailableAppConnection } from "@app/hooks/api/appConnections/types";
import type { TVercelConnectionOrganization } from "@app/hooks/api/appConnections/vercel/types";
import type {
  TGetEntraIdUsersDTO,
  TGetIbmApiConnectOrgAppsDTO,
  TGetIbmApiConnectOrgCatalogsDTO,
  TGetIbmApiConnectOrgsDTO
} from "@app/hooks/api/dynamicSecret/types";
import type { TGatewayPool } from "@app/hooks/api/gateway-pools/types";
import type { TGatewayV2 } from "@app/hooks/api/gateways-v2/types";

import type { V4QueryResult } from "../contract";

export type QueryOptions = { enabled?: boolean };

export type ConnectionOptions<TData> = (
  connectionId: string,
  options?: QueryOptions
) => V4QueryResult<TData[]>;

export type IbmApiConnectOption = { id: string; name: string; title: string };

export type ConnectionWithApp = TAvailableAppConnection & { app: AppConnection };

export type SecretsOptionsAdapter = {
  useAvailableConnections: (
    apps: AppConnection[],
    projectId: string
  ) => { connections: ConnectionWithApp[]; isPending: boolean };
  useGateways: () => V4QueryResult<TGatewayV2[]>;
  useGatewayPools: () => V4QueryResult<TGatewayPool[]>;
  useAwsKmsKeys: (
    dto: TListAwsConnectionKmsKeys,
    options?: QueryOptions
  ) => V4QueryResult<TAwsConnectionKmsKey[]>;
  useAwsIamUsers: ConnectionOptions<TAwsConnectionIamUser>;
  useGitHubOrganizations: ConnectionOptions<TGitHubConnectionOrganization>;
  useGitHubRepositories: ConnectionOptions<TGitHubConnectionRepository>;
  useGitHubEnvironments: (
    dto: TListGitHubConnectionEnvironments,
    options?: QueryOptions
  ) => V4QueryResult<TGitHubConnectionEnvironment[]>;
  useGcpProjects: ConnectionOptions<TGcpProject>;
  useGcpLocations: (
    dto: TListProjectLocations,
    options?: QueryOptions
  ) => V4QueryResult<TGcpLocation[]>;
  useVercelOrganizations: ConnectionOptions<TVercelConnectionOrganization>;
  useAuth0Clients: ConnectionOptions<TAuth0Client>;
  useAzureClients: ConnectionOptions<TAzureClient>;
  useOktaApps: ConnectionOptions<TOktaApp>;
  useDatabricksServicePrincipals: ConnectionOptions<TDatabricksServicePrincipal>;
  useSalesforceOauthApps: ConnectionOptions<TSalesforceOauthApp>;
  useOpenAIProjects: ConnectionOptions<TOpenAIProject>;
  useDatadogServiceAccounts: ConnectionOptions<TDatadogServiceAccount>;
  useFireworksServiceAccounts: ConnectionOptions<TFireworksServiceAccount>;
  useDbtProjects: ConnectionOptions<TDbtProject>;
  useSnowflakeUsers: ConnectionOptions<TSnowflakeUser>;
  useSupabaseProjects: ConnectionOptions<TSupabaseProject>;
  useCloudflareAccountZones: ConnectionOptions<TCloudflareZone>;
  useCloudflarePermissionGroups: ConnectionOptions<TCloudflarePermissionGroup>;
  useCloudflareR2Buckets: ConnectionOptions<TCloudflareR2Bucket>;
  useLiteLLMUsers: ConnectionOptions<TLiteLLMUser>;
  useLiteLLMTeams: ConnectionOptions<TLiteLLMTeam>;
  useLiteLLMModels: ConnectionOptions<TLiteLLMModel>;
  useOpenRouterWorkspaces: ConnectionOptions<TOpenRouterWorkspace>;
  useEntraIdUsers: (
    dto: TGetEntraIdUsersDTO & { enabled: boolean }
  ) => V4QueryResult<{ id: string; email: string; name: string }[]>;
  useIbmApiConnectOrgs: (
    dto: TGetIbmApiConnectOrgsDTO & { enabled: boolean }
  ) => V4QueryResult<IbmApiConnectOption[]>;
  useIbmApiConnectCatalogs: (
    dto: TGetIbmApiConnectOrgCatalogsDTO & { enabled: boolean }
  ) => V4QueryResult<IbmApiConnectOption[]>;
  useIbmApiConnectApps: (
    dto: TGetIbmApiConnectOrgAppsDTO & { enabled: boolean }
  ) => V4QueryResult<(IbmApiConnectOption & { consumerOrgId: string })[]>;
};
