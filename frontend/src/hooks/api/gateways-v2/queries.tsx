import { queryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TGatewayV2 } from "./types";

export const gatewaysV2QueryKeys = {
  allKey: () => ["gateways-v2"],
  listKey: () => [...gatewaysV2QueryKeys.allKey(), "list"],
  list: () =>
    queryOptions({
      queryKey: gatewaysV2QueryKeys.listKey(),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ gateways: TGatewayV2[] }>("/api/v2/gateways");
        return data.gateways;
      }
    })
};
