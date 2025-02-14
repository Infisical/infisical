import { apiRequest } from "@app/config/request";
import { queryOptions } from "@tanstack/react-query";
import { TGateway } from "./types";

export const gatewaysQueryKeys = {
  allKey: () => ["gateways"],
  listKey: () => [...gatewaysQueryKeys.allKey(), "list"],
  list: () =>
    queryOptions({
      queryKey: gatewaysQueryKeys.listKey(),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ gateways: TGateway[] }>("/api/v1/gateways");
        return data.gateways;
      }
    })
};
