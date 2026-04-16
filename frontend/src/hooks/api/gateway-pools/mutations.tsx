import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { gatewaysQueryKeys } from "../gateways/queries";
import { gatewayPoolsQueryKeys } from "./queries";
import {
  TAddGatewayToPoolDTO,
  TCreateGatewayPoolDTO,
  TGatewayPool,
  TGatewayPoolMembership,
  TRemoveGatewayFromPoolDTO,
  TUpdateGatewayPoolDTO
} from "./types";

export const useCreateGatewayPool = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: TCreateGatewayPoolDTO) => {
      const { data } = await apiRequest.post<TGatewayPool>("/api/v2/gateway-pools", dto);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gatewayPoolsQueryKeys.allKey() });
    }
  });
};

export const useUpdateGatewayPool = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ poolId, ...dto }: TUpdateGatewayPoolDTO) => {
      const { data } = await apiRequest.patch<TGatewayPool>(`/api/v2/gateway-pools/${poolId}`, dto);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gatewayPoolsQueryKeys.allKey() });
    }
  });
};

export const useDeleteGatewayPool = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (poolId: string) => {
      const { data } = await apiRequest.delete<TGatewayPool>(`/api/v2/gateway-pools/${poolId}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gatewayPoolsQueryKeys.allKey() });
    }
  });
};

export const useAddGatewayToPool = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ poolId, gatewayId }: TAddGatewayToPoolDTO) => {
      const { data } = await apiRequest.post<TGatewayPoolMembership>(
        `/api/v2/gateway-pools/${poolId}/memberships`,
        { gatewayId }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gatewayPoolsQueryKeys.allKey() });
      queryClient.invalidateQueries({ queryKey: gatewaysQueryKeys.allKey() });
    }
  });
};

export const useRemoveGatewayFromPool = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ poolId, gatewayId }: TRemoveGatewayFromPoolDTO) => {
      const { data } = await apiRequest.delete<TGatewayPoolMembership>(
        `/api/v2/gateway-pools/${poolId}/memberships/${gatewayId}`
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gatewayPoolsQueryKeys.allKey() });
      queryClient.invalidateQueries({ queryKey: gatewaysQueryKeys.allKey() });
    }
  });
};
