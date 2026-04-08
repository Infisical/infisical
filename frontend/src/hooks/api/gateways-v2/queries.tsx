import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TGatewayConnectedResources } from "./types";

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
  })
};

export const useGetGatewayConnectedResources = (gatewayId: string) => {
  return useQuery(gatewaysV2QueryKeys.connectedResources(gatewayId));
};
