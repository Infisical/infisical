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

// POST /v3/gateways — body { name, authMethod }. The frontend always sends method=token by
// default; API users may pass method=aws with the AWS allowlists for create-and-configure
// in one call.
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

// PATCH /v3/gateways/:id — switch auth method or update its config. Gateway names are
// fixed at create time; this endpoint doesn't support rename.
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

// POST /v3/gateways/:id/token — mint or rotate the bootstrap token. Token method only.
export const useMintGatewayToken = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ gatewayId }: { gatewayId: string }) => {
      const { data } = await apiRequest.post<TGatewayEnrollmentToken>(
        `/api/v3/gateways/${gatewayId}/token`
      );
      return data;
    },
    onSuccess: (_, { gatewayId }) => invalidateGatewayQueries(queryClient, gatewayId)
  });
};

// POST /v3/gateways/:id/revoke — method-aware broad revoke. Bumps tokenVersion (kicks the
// running gateway), clears heartbeat, and — for token method — deletes every enrollment
// token row (used + unused).
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
