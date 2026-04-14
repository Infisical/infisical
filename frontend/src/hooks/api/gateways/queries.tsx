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

        return [
          ...data.gateways.map((g) => ({
            ...g,
            isV1: true as const
          })),
          ...dataV2.map((g) => ({
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
            isExpired: false as const,
            hasReEnrollToken: false as const
          })),
          ...dataV2.map((g) => {
            const hasHeartbeat = !!g.heartbeat;
            const isPending = g.enrollmentTokenStatus === "pending" && !hasHeartbeat;
            const hasReEnrollToken = g.enrollmentTokenStatus === "pending" && hasHeartbeat;
            const isExpired = g.enrollmentTokenStatus === "expired" && !hasHeartbeat;

            return {
              ...g,
              isV1: false as const,
              isPending,
              isExpired,
              hasReEnrollToken
            };
          })
        ];
      }
    })
};
