import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { gatewaysQueryKeys } from "../gateways/queries";
import { TGatewayV2 } from "./types";

const invalidateGatewayQueries = (queryClient: ReturnType<typeof useQueryClient>) => {
  queryClient.invalidateQueries(gatewaysQueryKeys.list());
  queryClient.invalidateQueries(gatewaysQueryKeys.listWithTokens());
};

export const useDeleteGatewayV2ById = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      return apiRequest.delete(`/api/v2/gateways/${id}`);
    },
    onSuccess: () => {
      invalidateGatewayQueries(queryClient);
    }
  });
};

export const useTriggerGatewayV2Heartbeat = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      return apiRequest.post(`/api/v2/gateways/${id}/heartbeat`);
    },
    onSettled: () => {
      invalidateGatewayQueries(queryClient);
    }
  });
};

export const useCreateGateway = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name }: { name: string }) => {
      const { data } = await apiRequest.post<TGatewayV2>("/api/v3/gateways", { name });
      return data;
    },
    onSuccess: () => {
      invalidateGatewayQueries(queryClient);
    }
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
    onSuccess: () => {
      invalidateGatewayQueries(queryClient);
    }
  });
};
