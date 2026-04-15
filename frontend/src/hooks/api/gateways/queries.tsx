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
        const [{ data }, { data: dataV2 }] = await Promise.all([
          apiRequest.get<{ gateways: TGateway[] }>("/api/v1/gateways"),
          apiRequest.get<TGatewayV2[]>("/api/v2/gateways")
        ]);

        // Filter out enrollment-flow gateways that haven't connected yet
        // so gateway pickers don't show them as selectable options.
        const connectedV2 = dataV2.filter((g) => g.identityId || g.heartbeat);

        return [
          ...data.gateways.map((g) => ({
            ...g,
            isV1: true as const
          })),
          ...connectedV2.map((g) => ({
            ...g,
            isV1: false as const
          }))
        ];
      }
    }),
  listWithTokensKey: () => [...gatewaysQueryKeys.allKey(), "list-with-tokens"],
  listWithTokens: () =>
    queryOptions({
      queryKey: gatewaysQueryKeys.listWithTokensKey(),
      queryFn: async () => {
        const [{ data }, { data: dataV2 }] = await Promise.all([
          apiRequest.get<{ gateways: TGateway[] }>("/api/v1/gateways"),
          apiRequest.get<TGatewayV2[]>("/api/v2/gateways")
        ]);

        return [
          ...data.gateways.map((g) => ({
            ...g,
            isV1: true as const,
            isPending: false as const,
            hasReEnrollToken: false as const
          })),
          ...dataV2.map((g) => {
            const hasHeartbeat = !!g.heartbeat;
            const hasToken = g.enrollmentTokenStatus === "pending" || g.enrollmentTokenStatus === "expired";
            const isPending = hasToken && !hasHeartbeat;
            const hasReEnrollToken = g.enrollmentTokenStatus === "pending" && hasHeartbeat;

            return {
              ...g,
              isV1: false as const,
              isPending,
              hasReEnrollToken
            };
          })
        ];
      }
    })
};
