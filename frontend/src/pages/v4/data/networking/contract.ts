import type {
  TAddGatewayToPoolDTO,
  TCreateGatewayPoolDTO,
  TGatewayPool,
  TGatewayPoolConnectedResources,
  TRemoveGatewayFromPoolDTO,
  TUpdateGatewayPoolDTO
} from "@app/hooks/api/gateway-pools/types";
import type {
  SettableAuthMethodInput,
  TGatewayConnectedResources,
  TGatewayEnrollmentToken,
  TGatewayV2,
  TGatewayV2WithAuthMethod
} from "@app/hooks/api/gateways-v2/types";
import type { TRelayConnectedGateway } from "@app/hooks/api/relays/queries";
import type {
  TCreateRelayDTO,
  TRelay,
  TRelayWithAuthMethod,
  TUpdateRelayDTO
} from "@app/hooks/api/relays/types";
import type { SubscriptionPlan } from "@app/hooks/api/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type NetworkingAdapter = {
  useSubscription: (orgId: string) => V4QueryResult<SubscriptionPlan>;
  useGateways: () => V4QueryResult<TGatewayV2[]>;
  useConnectedGateways: (enabled?: boolean) => V4QueryResult<TGatewayV2[]>;
  useGateway: (gatewayId: string) => V4QueryResult<TGatewayV2WithAuthMethod>;
  useGatewayResources: (gatewayId: string) => V4QueryResult<TGatewayConnectedResources>;
  useCreateGateway: V4Mutation<
    { name: string; authMethod: SettableAuthMethodInput },
    TGatewayV2WithAuthMethod
  >;
  useUpdateGateway: V4Mutation<
    { gatewayId: string; name?: string; authMethod?: SettableAuthMethodInput },
    TGatewayV2WithAuthMethod
  >;
  useDeleteGateway: V4Mutation<string>;
  useTriggerGatewayHeartbeat: V4Mutation<string>;
  useMintGatewayToken: V4Mutation<{ gatewayId: string }, TGatewayEnrollmentToken>;
  useRevokeGateway: V4Mutation<{ gatewayId: string }>;
  usePools: (options?: {
    enabled?: boolean;
    refetchInterval?: number;
  }) => V4QueryResult<TGatewayPool[]>;
  usePoolResources: (poolId: string) => V4QueryResult<TGatewayPoolConnectedResources>;
  useCreatePool: V4Mutation<TCreateGatewayPoolDTO, TGatewayPool>;
  useUpdatePool: V4Mutation<TUpdateGatewayPoolDTO, TGatewayPool>;
  useDeletePool: V4Mutation<string>;
  useAddGatewayToPool: V4Mutation<TAddGatewayToPoolDTO>;
  useRemoveGatewayFromPool: V4Mutation<TRemoveGatewayFromPoolDTO>;
  useRelays: () => V4QueryResult<TRelay[]>;
  useRelay: (relayId: string) => V4QueryResult<TRelayWithAuthMethod>;
  useRelayGateways: (relayId: string) => V4QueryResult<TRelayConnectedGateway[]>;
  useCreateRelay: V4Mutation<TCreateRelayDTO, TRelayWithAuthMethod>;
  useUpdateRelay: V4Mutation<TUpdateRelayDTO, TRelayWithAuthMethod>;
  useDeleteRelay: V4Mutation<string>;
  useMintRelayToken: V4Mutation<{ relayId: string }, TGatewayEnrollmentToken>;
  useRevokeRelay: V4Mutation<{ relayId: string }>;
};
