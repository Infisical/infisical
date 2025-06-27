import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TZabbixHost } from "./types";

const zabbixConnectionKeys = {
  all: [...appConnectionKeys.all, "zabbix"] as const,
  listHosts: (connectionId: string) => [...zabbixConnectionKeys.all, "hosts", connectionId] as const
};

export const useZabbixConnectionListHosts = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TZabbixHost[],
      unknown,
      TZabbixHost[],
      ReturnType<typeof zabbixConnectionKeys.listHosts>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: zabbixConnectionKeys.listHosts(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TZabbixHost[]>(
        `/api/v1/app-connections/zabbix/${connectionId}/hosts`
      );

      return data;
    },
    ...options
  });
};
