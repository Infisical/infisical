import { queryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TGatewayV2 } from "../gateways-v2/types";

const hasConnected = (gateway: TGatewayV2) =>
  Boolean(gateway.identityId || gateway.heartbeat || gateway.directHeartbeat);

const fetchGateways = async () => {
  const { data } = await apiRequest.get<TGatewayV2[]>("/api/v2/gateways");
  return data;
};

export const gatewaysQueryKeys = {
  allKey: () => ["gateways"],
  listKey: () => [...gatewaysQueryKeys.allKey(), "list"],
  listAll: () =>
    queryOptions({
      queryKey: gatewaysQueryKeys.listKey(),
      queryFn: fetchGateways
    }),
  list: () =>
    queryOptions({
      queryKey: gatewaysQueryKeys.listKey(),
      queryFn: fetchGateways,
      select: (gateways: TGatewayV2[]) => gateways.filter(hasConnected)
    })
};
