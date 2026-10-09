import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";

export type TPaloAltoNetworksTemplates = {
  isPanorama: boolean;
  templates: string[];
};

export type TPaloAltoNetworksSslTlsServiceProfile = {
  name: string;
  vsys: string | null;
};

const DEVICE_LOOKUP_STALE_TIME_MS = 5 * 60 * 1000;

const paloAltoNetworksConnectionKeys = {
  all: [...appConnectionKeys.all, "palo-alto-networks"] as const,
  listTemplates: (connectionId: string) =>
    [...paloAltoNetworksConnectionKeys.all, "templates", connectionId] as const,
  listSslTlsServiceProfiles: (connectionId: string, template?: string) =>
    [
      ...paloAltoNetworksConnectionKeys.all,
      "ssl-tls-service-profiles",
      connectionId,
      template
    ] as const
};

export const usePaloAltoNetworksConnectionListTemplates = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TPaloAltoNetworksTemplates,
      unknown,
      TPaloAltoNetworksTemplates,
      ReturnType<typeof paloAltoNetworksConnectionKeys.listTemplates>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: paloAltoNetworksConnectionKeys.listTemplates(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TPaloAltoNetworksTemplates>(
        `/api/v1/app-connections/palo-alto-networks/${connectionId}/templates`
      );

      return data;
    },
    staleTime: DEVICE_LOOKUP_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    ...options,
    enabled: Boolean(connectionId) && (options?.enabled ?? true)
  });
};

export const usePaloAltoNetworksConnectionListSslTlsServiceProfiles = (
  connectionId: string,
  template?: string,
  options?: Omit<
    UseQueryOptions<
      TPaloAltoNetworksSslTlsServiceProfile[],
      unknown,
      TPaloAltoNetworksSslTlsServiceProfile[],
      ReturnType<typeof paloAltoNetworksConnectionKeys.listSslTlsServiceProfiles>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: paloAltoNetworksConnectionKeys.listSslTlsServiceProfiles(connectionId, template),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        sslTlsServiceProfiles: TPaloAltoNetworksSslTlsServiceProfile[];
      }>(`/api/v1/app-connections/palo-alto-networks/${connectionId}/ssl-tls-service-profiles`, {
        params: template ? { template } : undefined
      });

      return data.sslTlsServiceProfiles;
    },
    staleTime: DEVICE_LOOKUP_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    ...options,
    enabled: Boolean(connectionId) && (options?.enabled ?? true)
  });
};
