import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TUltraDNSZone } from "./types";

const ultraDNSConnectionKeys = {
  all: [...appConnectionKeys.all, "ultradns"] as const,
  listZones: (connectionId: string) =>
    [...ultraDNSConnectionKeys.all, "zones", connectionId] as const
};

export const useUltraDNSConnectionListZones = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TUltraDNSZone[],
      unknown,
      TUltraDNSZone[],
      ReturnType<typeof ultraDNSConnectionKeys.listZones>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: ultraDNSConnectionKeys.listZones(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TUltraDNSZone[]>(
        `/api/v1/app-connections/ultradns/${connectionId}/ultradns-zones`
      );

      return data;
    },
    ...options
  });
};
