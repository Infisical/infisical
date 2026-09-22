import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TPowerDnsZone } from "./types";

const powerDnsConnectionKeys = {
  all: [...appConnectionKeys.all, "powerdns"] as const,
  listZones: (connectionId: string) =>
    [...powerDnsConnectionKeys.all, "zones", connectionId] as const
};

export const usePowerDnsConnectionListZones = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TPowerDnsZone[],
      unknown,
      TPowerDnsZone[],
      ReturnType<typeof powerDnsConnectionKeys.listZones>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: powerDnsConnectionKeys.listZones(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TPowerDnsZone[]>(
        `/api/v1/app-connections/powerdns/${connectionId}/zones`
      );

      return data;
    },
    ...options
  });
};
