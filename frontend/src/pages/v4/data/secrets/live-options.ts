import { useQuery } from "@tanstack/react-query";

import { useAuth0ConnectionListClients } from "@app/hooks/api/appConnections/auth0/queries";
import {
  useListAwsConnectionIamUsers,
  useListAwsConnectionKmsKeys
} from "@app/hooks/api/appConnections/aws";
import { useAzureConnectionListClients } from "@app/hooks/api/appConnections/azure";
import {
  useCloudflareConnectionListPermissionGroups,
  useCloudflareConnectionListR2Buckets,
  useCloudflareConnectionListZones
} from "@app/hooks/api/appConnections/cloudflare";
import { useDatabricksConnectionListServicePrincipals } from "@app/hooks/api/appConnections/databricks";
import { useListDatadogConnectionServiceAccounts } from "@app/hooks/api/appConnections/datadog";
import { useDbtConnectionListProjects } from "@app/hooks/api/appConnections/dbt";
import { useFireworksConnectionListServiceAccounts } from "@app/hooks/api/appConnections/fireworks";
import {
  useGcpConnectionListProjectLocations,
  useGcpConnectionListProjects
} from "@app/hooks/api/appConnections/gcp/queries";
import {
  useGitHubConnectionListEnvironments,
  useGitHubConnectionListOrganizations,
  useGitHubConnectionListRepositories
} from "@app/hooks/api/appConnections/github";
import {
  useListLiteLLMConnectionModels,
  useListLiteLLMConnectionTeams,
  useListLiteLLMConnectionUsers
} from "@app/hooks/api/appConnections/litellm";
import { useOktaConnectionListApps } from "@app/hooks/api/appConnections/okta";
import { useListOpenRouterConnectionWorkspaces } from "@app/hooks/api/appConnections/open-router";
import { useListOpenAIConnectionProjects } from "@app/hooks/api/appConnections/openai";
import { useListAvailableAppConnectionsForApps } from "@app/hooks/api/appConnections/queries";
import { useSalesforceConnectionListOauthApps } from "@app/hooks/api/appConnections/salesforce/queries";
import { useSnowflakeConnectionListUsers } from "@app/hooks/api/appConnections/snowflake";
import { useSupabaseConnectionListProjects } from "@app/hooks/api/appConnections/supabase";
import { useVercelConnectionListOrganizations } from "@app/hooks/api/appConnections/vercel";
import {
  useGetDynamicSecretProviderData,
  useGetIbmApiConnectOrgApps,
  useGetIbmApiConnectOrgCatalogs,
  useGetIbmApiConnectOrgs
} from "@app/hooks/api/dynamicSecret/queries";
import { useListGatewayPools } from "@app/hooks/api/gateway-pools/queries";
import { gatewaysQueryKeys } from "@app/hooks/api/gateways/queries";

import type { SecretsOptionsAdapter } from "./contract-options";

export const secretsOptionsLive: SecretsOptionsAdapter = {
  useAvailableConnections: useListAvailableAppConnectionsForApps,
  useGateways: () => useQuery(gatewaysQueryKeys.list()),
  useGatewayPools: () => useListGatewayPools(),
  useAwsKmsKeys: (dto, options) => useListAwsConnectionKmsKeys(dto, options),
  useAwsIamUsers: (connectionId, options) =>
    useListAwsConnectionIamUsers({ connectionId }, options),
  useGitHubOrganizations: (connectionId, options) =>
    useGitHubConnectionListOrganizations(connectionId, options),
  useGitHubRepositories: (connectionId, options) =>
    useGitHubConnectionListRepositories(connectionId, options),
  useGitHubEnvironments: (dto, options) => useGitHubConnectionListEnvironments(dto, options),
  useGcpProjects: (connectionId, options) => useGcpConnectionListProjects(connectionId, options),
  useGcpLocations: (dto, options) => useGcpConnectionListProjectLocations(dto, options),
  useVercelOrganizations: (connectionId, options) =>
    useVercelConnectionListOrganizations(connectionId, undefined, options),
  useAuth0Clients: (connectionId, options) => useAuth0ConnectionListClients(connectionId, options),
  useAzureClients: (connectionId, options) => useAzureConnectionListClients(connectionId, options),
  useOktaApps: (connectionId, options) => useOktaConnectionListApps(connectionId, options),
  useDatabricksServicePrincipals: (connectionId, options) =>
    useDatabricksConnectionListServicePrincipals(connectionId, options),
  useSalesforceOauthApps: (connectionId, options) =>
    useSalesforceConnectionListOauthApps(connectionId, options),
  useOpenAIProjects: (connectionId, options) =>
    useListOpenAIConnectionProjects(connectionId, options),
  useDatadogServiceAccounts: (connectionId, options) =>
    useListDatadogConnectionServiceAccounts(connectionId, options),
  useFireworksServiceAccounts: (connectionId, options) =>
    useFireworksConnectionListServiceAccounts(connectionId, options),
  useDbtProjects: (connectionId, options) => useDbtConnectionListProjects(connectionId, options),
  useSnowflakeUsers: (connectionId, options) =>
    useSnowflakeConnectionListUsers(connectionId, options),
  useSupabaseProjects: (connectionId, options) =>
    useSupabaseConnectionListProjects(connectionId, options),
  useCloudflareAccountZones: (connectionId, options) =>
    useCloudflareConnectionListZones(connectionId, options, true),
  useCloudflarePermissionGroups: (connectionId, options) =>
    useCloudflareConnectionListPermissionGroups(connectionId, options),
  useCloudflareR2Buckets: (connectionId, options) =>
    useCloudflareConnectionListR2Buckets(connectionId, options),
  useLiteLLMUsers: (connectionId, options) =>
    useListLiteLLMConnectionUsers(connectionId, undefined, options),
  useLiteLLMTeams: (connectionId, options) =>
    useListLiteLLMConnectionTeams(connectionId, undefined, options),
  useLiteLLMModels: (connectionId, options) =>
    useListLiteLLMConnectionModels(connectionId, options),
  useOpenRouterWorkspaces: (connectionId, options) =>
    useListOpenRouterConnectionWorkspaces(connectionId, options),
  useEntraIdUsers: useGetDynamicSecretProviderData,
  useIbmApiConnectOrgs: useGetIbmApiConnectOrgs,
  useIbmApiConnectCatalogs: useGetIbmApiConnectOrgCatalogs,
  useIbmApiConnectApps: useGetIbmApiConnectOrgApps
};
