import { useQuery } from "@tanstack/react-query";

import {
  useAddGatewayToPool,
  useCreateGatewayPool,
  useDeleteGatewayPool,
  useGetGatewayPoolConnectedResources,
  useListGatewayPools,
  useRemoveGatewayFromPool,
  useUpdateGatewayPool
} from "@app/hooks/api/gateway-pools";
import { gatewaysQueryKeys } from "@app/hooks/api/gateways";
import {
  useCreateGateway,
  useDeleteGatewayV2ById,
  useGetGatewayConnectedResources,
  useGetGatewayV2ById,
  useMintGatewayToken,
  useRevokeGatewayAccess,
  useTriggerGatewayV2Heartbeat,
  useUpdateGateway
} from "@app/hooks/api/gateways-v2";
import {
  useCreateRelay,
  useDeleteRelayById,
  useGenerateRelayEnrollmentToken,
  useGetRelayById,
  useGetRelayConnectedGateways,
  useGetRelays,
  useRevokeRelayAccess,
  useUpdateRelay
} from "@app/hooks/api/relays";
import { useGetOrgSubscription } from "@app/hooks/api/subscriptions/queries";

import type { NetworkingAdapter } from "./contract";

export const networkingLive: NetworkingAdapter = {
  useSubscription: (orgId) => useGetOrgSubscription({ orgID: orgId }),
  useGateways: () => useQuery({ ...gatewaysQueryKeys.listAll(), refetchInterval: 15_000 }),
  useConnectedGateways: (enabled = true) => useQuery({ ...gatewaysQueryKeys.list(), enabled }),
  useGateway: useGetGatewayV2ById,
  useGatewayResources: useGetGatewayConnectedResources,
  useCreateGateway,
  useUpdateGateway,
  useDeleteGateway: useDeleteGatewayV2ById,
  useTriggerGatewayHeartbeat: useTriggerGatewayV2Heartbeat,
  useMintGatewayToken,
  useRevokeGateway: useRevokeGatewayAccess,
  usePools: useListGatewayPools,
  usePoolResources: useGetGatewayPoolConnectedResources,
  useCreatePool: useCreateGatewayPool,
  useUpdatePool: useUpdateGatewayPool,
  useDeletePool: useDeleteGatewayPool,
  useAddGatewayToPool,
  useRemoveGatewayFromPool,
  useRelays: useGetRelays,
  useRelay: useGetRelayById,
  useRelayGateways: useGetRelayConnectedGateways,
  useCreateRelay,
  useUpdateRelay,
  useDeleteRelay: useDeleteRelayById,
  useMintRelayToken: useGenerateRelayEnrollmentToken,
  useRevokeRelay: useRevokeRelayAccess
};
