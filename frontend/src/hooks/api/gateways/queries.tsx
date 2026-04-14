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

        // Gateways that have a pending (non-expired) re-enrollment token
        const reEnrollGatewayIds = new Set(
          unusedTokens
            .filter((t) => t.gatewayId && new Date(t.expiresAt) > now)
            .map((t) => t.gatewayId)
        );

        // Standalone tokens (no gateway record yet), both active and expired
        const enrolledNames = new Set(dataV2.map((g) => g.name));
        const standaloneTokens = unusedTokens.filter(
          (t) => !t.gatewayId && !enrolledNames.has(t.name)
        );

        return [
          ...data.gateways.map((g) => ({
            ...g,
            isV1: true as const,
            isPending: false as const,
            isExpired: false as const,
            isTokenOnly: false as const
          })),
          ...dataV2.map((g) => ({
            ...g,
            isV1: false as const,
            isPending: reEnrollGatewayIds.has(g.id) as boolean,
            isExpired: false as const,
            isTokenOnly: false as const
          })),
          ...standaloneTokens.map((t) => ({
            id: t.id,
            name: t.name,
            createdAt: t.createdAt,
            expiresAt: t.expiresAt,
            isV1: false as const,
            isPending: new Date(t.expiresAt) > now,
            isExpired: new Date(t.expiresAt) <= now,
            isTokenOnly: true as const
          }))
        ];
      }
    })
};
