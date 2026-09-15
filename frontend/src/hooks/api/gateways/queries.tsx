import { queryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TGatewayV2 } from "../gateways-v2/types";

export type TListedGateway = TGatewayV2;

export const gatewaysQueryKeys = {
  allKey: () => ["gateways"],
  listKey: () => [...gatewaysQueryKeys.allKey(), "list"],
  list: () =>
    queryOptions({
      queryKey: gatewaysQueryKeys.listKey(),
      queryFn: async () => {
        const { data } = await apiRequest.get<TGatewayV2[]>("/api/v2/gateways");

        // Filter out enrollment-flow gateways that haven't connected yet
        // so gateway pickers don't show them as selectable options.
        return data.filter((g) => g.identityId || g.heartbeat || g.directHeartbeat);
      }
    }),
  listWithTokensKey: () => [...gatewaysQueryKeys.allKey(), "list-with-tokens"],
  listWithTokens: () =>
    queryOptions({
      queryKey: gatewaysQueryKeys.listWithTokensKey(),
      queryFn: async () => {
        const { data } = await apiRequest.get<TGatewayV2[]>("/api/v2/gateways");
        return data;
      }
    })
};
