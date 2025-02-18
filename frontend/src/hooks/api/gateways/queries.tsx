import { queryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TGateway, TListGatewayDTO } from "./types";

export const gatewaysQueryKeys = {
  allKey: () => ["gateways"],
  listKey: ({ projectId }: TListGatewayDTO) => [
    ...gatewaysQueryKeys.allKey(),
    "list",
    { projectId }
  ],
  list: ({ projectId }: TListGatewayDTO = {}) =>
    queryOptions({
      queryKey: gatewaysQueryKeys.listKey({ projectId }),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ gateways: TGateway[] }>("/api/v1/gateways", {
          params: { projectId }
        });
        return data.gateways;
      }
    })
};
