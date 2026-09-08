import { queryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TGatewayV2 } from "../gateways-v2/types";
import { TGateway } from "./types";

export type TListedGatewayV1 = TGateway & { isV1: true };
export type TListedGatewayV2 = TGatewayV2 & { isV1: false };
export type TListedGateway = TListedGatewayV1 | TListedGatewayV2;

// A type predicate, so the narrowing survives a .filter(). A plain `!g.isV1` callback returns the
// union unchanged, which is how v1 gateways reached helpers that only accept the v2 shape.
export const isListedGatewayV2 = (gateway: TListedGateway): gateway is TListedGatewayV2 =>
  !gateway.isV1;

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
        const connectedV2 = dataV2.filter((g) => g.identityId || g.heartbeat || g.directHeartbeat);

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
          ...data.gateways.map((g) => ({ ...g, isV1: true as const })),
          ...dataV2.map((g) => ({ ...g, isV1: false as const }))
        ];
      }
    })
};
