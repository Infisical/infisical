import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TAzureDNSZone } from "./types";

const azureDnsConnectionKeys = {
  all: [...appConnectionKeys.all, "azure-dns"] as const,
  listZones: (connectionId: string) =>
    [...azureDnsConnectionKeys.all, "zones", connectionId] as const
};

export const useAzureDNSConnectionListZones = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TAzureDNSZone[],
      unknown,
      TAzureDNSZone[],
      ReturnType<typeof azureDnsConnectionKeys.listZones>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: azureDnsConnectionKeys.listZones(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TAzureDNSZone[]>(
        `/api/v1/app-connections/azure-dns/${connectionId}/azure-dns-zones`
      );

      return data;
    },
    ...options
  });
};
