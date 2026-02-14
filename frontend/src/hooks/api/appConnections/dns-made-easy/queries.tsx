import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TDNSMadeEasyZone } from "./types";

const dnsMadeEasyConnectionKeys = {
  all: [...appConnectionKeys.all, "dns-made-easy"] as const,
  listZones: (connectionId: string) =>
    [...dnsMadeEasyConnectionKeys.all, "zones", connectionId] as const
};

export const useDNSMadeEasyConnectionListZones = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TDNSMadeEasyZone[],
      unknown,
      TDNSMadeEasyZone[],
      ReturnType<typeof dnsMadeEasyConnectionKeys.listZones>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: dnsMadeEasyConnectionKeys.listZones(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TDNSMadeEasyZone[]>(
        `/api/v1/app-connections/dns-made-easy/${connectionId}/dns-made-easy-zones`,
        {}
      );

      return data;
    },
    ...options
  });
};
