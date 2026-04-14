import { queryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TGatewayEnrollmentToken, TGatewayV2 } from "../gateways-v2/types";
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
        const [{ data }, { data: dataV2 }, { data: enrollmentTokens }] = await Promise.all([
          apiRequest.get<{ gateways: TGateway[] }>("/api/v1/gateways"),
          apiRequest.get<TGatewayV2[]>("/api/v2/gateways"),
          apiRequest.get<TGatewayEnrollmentToken[]>("/api/v2/gateways/enrollment-tokens")
        ]);

        const now = new Date();
        const unusedTokens = enrollmentTokens.filter((t) => !t.usedAt);

        // Gateways with a non-expired unused enrollment token (pending initial enrollment or re-enrollment)
        const pendingGatewayIds = new Set(
          unusedTokens
            .filter((t) => t.gatewayId && new Date(t.expiresAt) > now)
            .map((t) => t.gatewayId)
        );

        // Gateways whose only unused token is expired
        const expiredGatewayIds = new Set(
          unusedTokens
            .filter((t) => t.gatewayId && new Date(t.expiresAt) <= now && !pendingGatewayIds.has(t.gatewayId))
            .map((t) => t.gatewayId)
        );

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
            const isPending = pendingGatewayIds.has(g.id) && !hasHeartbeat;
            const hasReEnrollToken = pendingGatewayIds.has(g.id) && hasHeartbeat;
            const isExpired = expiredGatewayIds.has(g.id) && !hasHeartbeat;

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
