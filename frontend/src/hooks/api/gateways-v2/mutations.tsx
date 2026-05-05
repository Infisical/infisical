import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { gatewaysQueryKeys } from "../gateways/queries";
import { gatewaysV2QueryKeys } from "./queries";
import {
  SettableAuthMethodInput,
  TGatewayEnrollmentToken,
  TGatewayV2WithAuthMethod
} from "./types";

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
    mutationFn: async ({
      name,
      authMethod
    }: {
      name: string;
      authMethod: SettableAuthMethodInput;
    }) => {
      const { data } = await apiRequest.post<TGatewayV2WithAuthMethod>("/api/v3/gateways", {
        name,
        authMethod
      });
      return data;
    },
    onSuccess: (gateway) => invalidateGatewayQueries(queryClient, gateway.id)
  });
};

export const useUpdateGateway = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      gatewayId,
      authMethod
    }: {
      gatewayId: string;
      authMethod?: SettableAuthMethodInput;
    }) => {
      const { data } = await apiRequest.patch<TGatewayV2WithAuthMethod>(
        `/api/v3/gateways/${gatewayId}`,
        { authMethod }
      );
      return data;
    },
    onSuccess: (_, { gatewayId }) => invalidateGatewayQueries(queryClient, gatewayId)
  });
};

export const useMintGatewayToken = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ gatewayId }: { gatewayId: string }) => {
      const { data } = await apiRequest.post<TGatewayEnrollmentToken>(
        `/api/v3/gateways/${gatewayId}/token-auth/generate-enrollment-token`
      );
      return data;
    },
    onSuccess: (_, { gatewayId }) => invalidateGatewayQueries(queryClient, gatewayId)
  });
};

export const useRevokeGatewayAccess = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ gatewayId }: { gatewayId: string }) => {
      const { data } = await apiRequest.post<{
        method: "aws" | "token";
        deletedTokenCount: number;
      }>(`/api/v3/gateways/${gatewayId}/revoke`);
      return data;
    },
    onSuccess: (_, { gatewayId }) => invalidateGatewayQueries(queryClient, gatewayId)
  });
};
