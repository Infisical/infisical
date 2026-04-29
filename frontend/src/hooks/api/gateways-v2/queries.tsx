import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TGatewayConnectedResources, TGatewayV2 } from "./types";

export const gatewaysV2QueryKeys = {
  allKey: () => ["gateways-v2"],
  connectedResourcesKey: (gatewayId: string) => [
    ...gatewaysV2QueryKeys.allKey(),
    "connected-resources",
    gatewayId
  ],
  connectedResources: (gatewayId: string) => ({
    queryKey: gatewaysV2QueryKeys.connectedResourcesKey(gatewayId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGatewayConnectedResources>(
        `/api/v2/gateways/${gatewayId}/resources`
      );
      return data;
    },
    enabled: Boolean(gatewayId)
  }),
  byIdKey: (gatewayId: string) => [...gatewaysV2QueryKeys.allKey(), "by-id", gatewayId],
  byId: (gatewayId: string) => ({
    queryKey: gatewaysV2QueryKeys.byIdKey(gatewayId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGatewayV2[]>("/api/v2/gateways");
      return data.find((g) => g.id === gatewayId) ?? null;
    },
    enabled: Boolean(gatewayId)
  })
};

export const useGetGatewayConnectedResources = (gatewayId: string) => {
  return useQuery(gatewaysV2QueryKeys.connectedResources(gatewayId));
};

export const useGetGatewayV2ById = (gatewayId: string) => {
  return useQuery(gatewaysV2QueryKeys.byId(gatewayId));
};
