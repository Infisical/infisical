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

        // Build a set of names that already have a real gateway (enrolled + registered)
        const enrolledNames = new Set(dataV2.map((g) => g.name));

        // Pending tokens: unused, not expired, and not already enrolled as a gateway
        const now = new Date();
        const pendingTokens = enrollmentTokens.filter(
          (t) => !t.usedAt && new Date(t.expiresAt) > now && !enrolledNames.has(t.name)
        );

        return [
          ...data.gateways.map((g) => ({
            ...g,
            isV1: true as const,
            isPending: false as const
          })),
          ...dataV2.map((g) => ({
            ...g,
            isV1: false as const,
            isPending: false as const
          })),
          ...pendingTokens.map((t) => ({
            id: t.id,
            name: t.name,
            createdAt: t.createdAt,
            expiresAt: t.expiresAt,
            isV1: false as const,
            isPending: true as const
          }))
        ];
      }
    })
};
