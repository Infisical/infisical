import { queryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TGateway, TListProjectGatewayDTO, TProjectGateway } from "./types";

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
    }),
  listProjectGatewayKey: ({ projectId }: TListProjectGatewayDTO) => [
    ...gatewaysQueryKeys.allKey(),
    "list",
    { projectId }
  ],
  listProjectGateways: ({ projectId }: TListProjectGatewayDTO) =>
    queryOptions({
      queryKey: gatewaysQueryKeys.listProjectGatewayKey({ projectId }),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ gateways: TProjectGateway[] }>(
          `/api/v1/gateways/projects/${projectId}`
        );
        return data.gateways;
      }
    })
};
