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
        const [{ data }, { data: dataV2 }, { data: enrollmentTokens }] = await Promise.all([
          apiRequest.get<{ gateways: TGateway[] }>("/api/v1/gateways"),
          apiRequest.get<TGatewayV2[]>("/api/v2/gateways"),
          apiRequest.get<TGatewayEnrollmentToken[]>("/api/v2/gateways/enrollment-tokens")
        ]);

        const now = new Date();
        const activeTokens = enrollmentTokens.filter(
          (t) => !t.usedAt && new Date(t.expiresAt) > now
        );

        // Gateways that have a pending re-enrollment token
        const reEnrollGatewayIds = new Set(
          activeTokens.filter((t) => t.gatewayId).map((t) => t.gatewayId)
        );

        // Fresh pending tokens (no gateway record yet)
        const enrolledNames = new Set(dataV2.map((g) => g.name));
        const pendingTokens = activeTokens.filter(
          (t) => !t.gatewayId && !enrolledNames.has(t.name)
        );

        return [
          ...data.gateways.map((g) => ({
            ...g,
            isV1: true as const,
            isPending: false as const,
            isTokenOnly: false as const
          })),
          ...dataV2.map((g) => ({
            ...g,
            isV1: false as const,
            isPending: reEnrollGatewayIds.has(g.id) as boolean,
            isTokenOnly: false as const
          })),
          ...pendingTokens.map((t) => ({
            id: t.id,
            name: t.name,
            createdAt: t.createdAt,
            expiresAt: t.expiresAt,
            isV1: false as const,
            isPending: true as const,
            isTokenOnly: true as const
          }))
        ];
      }
    })
};
