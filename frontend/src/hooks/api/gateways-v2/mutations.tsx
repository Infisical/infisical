import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { gatewaysQueryKeys } from "../gateways/queries";
import { gatewaysV2QueryKeys } from "./queries";
import { TGatewayV2 } from "./types";

const invalidateGatewayQueries = (
  queryClient: ReturnType<typeof useQueryClient>,
  gatewayId?: string
) => {
  queryClient.invalidateQueries(gatewaysQueryKeys.list());
  queryClient.invalidateQueries(gatewaysQueryKeys.listWithTokens());
  if (gatewayId) {
    queryClient.invalidateQueries({ queryKey: gatewaysV2QueryKeys.byIdKey(gatewayId) });
    queryClient.invalidateQueries({
      queryKey: gatewaysV2QueryKeys.connectedResourcesKey(gatewayId)
    });
  } else {
    // For operations without a known id (e.g. bulk refetches), invalidate the full namespace.
    queryClient.invalidateQueries({ queryKey: gatewaysV2QueryKeys.allKey() });
  }
};

export const useDeleteGatewayV2ById = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      return apiRequest.delete(`/api/v2/gateways/${id}`);
    },
    onSuccess: (_, id) => invalidateGatewayQueries(queryClient, id)
  });
};

export const useTriggerGatewayV2Heartbeat = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      return apiRequest.post(`/api/v2/gateways/${id}/heartbeat`);
    },
    onSettled: (_, __, id) => invalidateGatewayQueries(queryClient, id)
  });
};

export const useCreateGateway = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, relayName }: { name: string; relayName?: string }) => {
      const { data } = await apiRequest.post<TGatewayV2>("/api/v3/gateways", { name, relayName });
      return data;
    },
    onSuccess: (gateway) => invalidateGatewayQueries(queryClient, gateway.id)
  });
};

export const useConfigureGatewayTokenAuth = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ gatewayId }: { gatewayId: string }) => {
      const { data } = await apiRequest.post<{ token: string; expiresAt: string }>(
        `/api/v3/gateways/${gatewayId}/token-auth/configure`
      );
      return data;
    },
    onSuccess: (_, { gatewayId }) => invalidateGatewayQueries(queryClient, gatewayId)
  });
};
