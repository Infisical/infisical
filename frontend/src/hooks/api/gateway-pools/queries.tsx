import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TGatewayPool, TGatewayPoolConnectedResources, TGatewayPoolWithMembers } from "./types";

export const gatewayPoolsQueryKeys = {
  allKey: () => ["gateway-pools"],
  listKey: () => [...gatewayPoolsQueryKeys.allKey(), "list"],
  list: () => ({
    queryKey: gatewayPoolsQueryKeys.listKey(),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGatewayPool[]>("/api/v2/gateway-pools");
      return data;
    }
  }),
  detailKey: (poolId: string) => [...gatewayPoolsQueryKeys.allKey(), "detail", poolId],
  detail: (poolId: string) => ({
    queryKey: gatewayPoolsQueryKeys.detailKey(poolId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGatewayPoolWithMembers>(
        `/api/v2/gateway-pools/${poolId}`
      );
      return data;
    },
    enabled: Boolean(poolId)
  })
};

export const useListGatewayPools = (options?: { refetchInterval?: number }) => {
  return useQuery({
    ...gatewayPoolsQueryKeys.list(),
    refetchInterval: options?.refetchInterval
  });
};

export const useGetGatewayPool = (poolId: string) => {
  return useQuery(gatewayPoolsQueryKeys.detail(poolId));
};

export const useGetGatewayPoolConnectedResources = (poolId: string) => {
  return useQuery({
    queryKey: [...gatewayPoolsQueryKeys.allKey(), "connected-resources", poolId],
    queryFn: async () => {
      const { data } = await apiRequest.get<TGatewayPoolConnectedResources>(
        `/api/v2/gateway-pools/${poolId}/resources`
      );
      return data;
    },
    enabled: Boolean(poolId)
  });
};
