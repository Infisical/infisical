import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { gatewaysQueryKeys } from "../gateways/queries";
import { TCreateGatewayEnrollmentTokenResponse } from "./types";

export const gatewayEnrollmentTokenQueryKey = () => ["gateway-enrollment-tokens"];

export const useDeleteGatewayV2ById = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      return apiRequest.delete(`/api/v2/gateways/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(gatewaysQueryKeys.list());
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
      queryClient.invalidateQueries(gatewaysQueryKeys.list());
    }
  });
};

export const useCreateGatewayEnrollmentToken = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name }: { name: string }) => {
      const { data } = await apiRequest.post<TCreateGatewayEnrollmentTokenResponse>(
        "/api/v2/gateways/enrollment-tokens",
        { name }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(gatewaysQueryKeys.list());
    }
  });
};

export const useReEnrollGateway = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ gatewayId, tokenId }: { gatewayId?: string; tokenId?: string }) => {
      const { data } = await apiRequest.post<TCreateGatewayEnrollmentTokenResponse>(
        "/api/v2/gateways/re-enroll",
        { gatewayId, tokenId }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(gatewaysQueryKeys.list());
    }
  });
};

export const useDeleteGatewayEnrollmentToken = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tokenId: string) => {
      await apiRequest.delete(`/api/v2/gateways/enrollment-tokens/${tokenId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(gatewaysQueryKeys.list());
    }
  });
};
