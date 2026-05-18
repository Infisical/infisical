import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { relayQueryKeys } from "./queries";
import {
  TCreateRelayDTO,
  TGenerateRelayEnrollmentTokenDTO,
  TRelayWithAuthMethod,
  TRevokeRelayAccessDTO,
  TUpdateRelayAuthMethodDTO
} from "./types";

export const useDeleteRelayById = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      return apiRequest.delete(`/api/v1/relays/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: relayQueryKeys.list() });
    }
  });
};

export const useCreateRelay = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: TCreateRelayDTO) => {
      const { data } = await apiRequest.post<TRelayWithAuthMethod>("/api/v2/relays", dto);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: relayQueryKeys.list() });
    }
  });
};

export const useUpdateRelayAuthMethod = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ relayId, authMethod }: TUpdateRelayAuthMethodDTO) => {
      const { data } = await apiRequest.patch<TRelayWithAuthMethod>(`/api/v2/relays/${relayId}`, {
        authMethod
      });
      return data;
    },
    onSuccess: (_, { relayId }) => {
      queryClient.invalidateQueries({ queryKey: relayQueryKeys.byId(relayId) });
    }
  });
};

export const useGenerateRelayEnrollmentToken = () => {
  return useMutation({
    mutationFn: async ({ relayId }: TGenerateRelayEnrollmentTokenDTO) => {
      const { data } = await apiRequest.post<{ token: string; expiresAt: string }>(
        `/api/v2/relays/${relayId}/token-auth/generate-enrollment-token`
      );
      return data;
    }
  });
};

export const useRevokeRelayAccess = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ relayId }: TRevokeRelayAccessDTO) => {
      const { data } = await apiRequest.post<{ method: string; deletedTokenCount: number }>(
        `/api/v2/relays/${relayId}/revoke`
      );
      return data;
    },
    onSuccess: (_, { relayId }) => {
      queryClient.invalidateQueries({ queryKey: relayQueryKeys.byId(relayId) });
      queryClient.invalidateQueries({ queryKey: relayQueryKeys.list() });
    }
  });
};
