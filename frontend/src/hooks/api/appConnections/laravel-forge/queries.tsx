import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { appConnectionKeys } from "@app/hooks/api/appConnections";

import { TLaravelForgeOrganization, TLaravelForgeServer, TLaravelForgeSite } from "./types";

const laravelForgeConnectionKeys = {
  all: [...appConnectionKeys.all, "laravel-forge"] as const,
  listOrganizations: (connectionId: string) =>
    [...laravelForgeConnectionKeys.all, "organizations", connectionId] as const,
  listServers: (connectionId: string, organizationSlug: string) =>
    [...laravelForgeConnectionKeys.all, "servers", connectionId, organizationSlug] as const,
  listSites: (connectionId: string, organizationSlug: string, serverId: string) =>
    [...laravelForgeConnectionKeys.all, "sites", connectionId, organizationSlug, serverId] as const
};

export const useLaravelForgeConnectionListOrganizations = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TLaravelForgeOrganization[],
      unknown,
      TLaravelForgeOrganization[],
      ReturnType<typeof laravelForgeConnectionKeys.listOrganizations>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: laravelForgeConnectionKeys.listOrganizations(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TLaravelForgeOrganization[]>(
        `/api/v1/app-connections/laravel-forge/${connectionId}/organizations`
      );

      return data;
    },
    ...options
  });
};

export const useLaravelForgeConnectionListServers = (
  connectionId: string,
  organizationSlug: string,
  options?: Omit<
    UseQueryOptions<
      TLaravelForgeServer[],
      unknown,
      TLaravelForgeServer[],
      ReturnType<typeof laravelForgeConnectionKeys.listServers>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: laravelForgeConnectionKeys.listServers(connectionId, organizationSlug),
    queryFn: async () => {
      const params = { organizationSlug };
      const { data } = await apiRequest.get<TLaravelForgeServer[]>(
        `/api/v1/app-connections/laravel-forge/${connectionId}/servers`,
        { params }
      );

      return data;
    },
    enabled: Boolean(connectionId && organizationSlug),
    ...options
  });
};

export const useLaravelForgeConnectionListSites = (
  connectionId: string,
  organizationSlug: string,
  serverId: string,
  options?: Omit<
    UseQueryOptions<
      TLaravelForgeSite[],
      unknown,
      TLaravelForgeSite[],
      ReturnType<typeof laravelForgeConnectionKeys.listSites>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: laravelForgeConnectionKeys.listSites(connectionId, organizationSlug, serverId),
    queryFn: async () => {
      const params = {
        organizationSlug,
        serverId
      };

      const { data } = await apiRequest.get<TLaravelForgeSite[]>(
        `/api/v1/app-connections/laravel-forge/${connectionId}/sites`,
        { params }
      );

      return data;
    },
    enabled: Boolean(connectionId && organizationSlug && serverId),
    ...options
  });
};
