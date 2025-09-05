import { queryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TConnector } from "../connectors/types";
import { TGateway } from "./types";

export const gatewaysQueryKeys = {
  allKey: () => ["gateways"],
  listKey: () => [...gatewaysQueryKeys.allKey(), "list"],
  list: () =>
    queryOptions({
      queryKey: gatewaysQueryKeys.listKey(),
      queryFn: async () => {
        const [{ data }, { data: dataV2 }] = await Promise.all([
          apiRequest.get<{ gateways: TGateway[] }>("/api/v1/gateways"),
          apiRequest.get<TConnector[]>("/api/v1/connectors")
        ]);

        return [
          ...data.gateways.map((g) => ({
            ...g,
            isV1: true
          })),
          ...dataV2.map((g) => ({
            ...g,
            isV1: false
          }))
        ];
      }
    })
};
