import { queryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TGatewayV2 } from "../gateways-v2/types";
import { TGateway } from "./types";

export const gatewaysQueryKeys = {
  allKey: () => ["gateways"],
  listKey: () => [...gatewaysQueryKeys.allKey(), "list"],
  list: () =>
    queryOptions({
      queryKey: gatewaysQueryKeys.listKey(),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ gateways: TGateway[] }>("/api/v1/gateways");
        const { data: dataV2 } = await apiRequest.get<TGatewayV2[]>("/api/v2/gateways");

        return [...data.gateways, ...dataV2];
      }
    })
};
