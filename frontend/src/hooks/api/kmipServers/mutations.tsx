import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { kmipServerQueryKeys } from "./queries";
import {
  TCreateKmipServerDTO,
  TGenerateKmipServerEnrollmentTokenDTO,
  TKmipServerWithAuthMethod,
  TRevokeKmipServerAccessDTO,
  TUpdateKmipServerDTO
} from "./types";

export const useDeleteKmipServerById = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (kmipServerId: string) => {
      return apiRequest.delete(`/api/v1/kmip/servers/${kmipServerId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kmipServerQueryKeys.list() });
    }
  });
};

export const useCreateKmipServer = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: TCreateKmipServerDTO) => {
      const { data } = await apiRequest.post<TKmipServerWithAuthMethod>(
        "/api/v1/kmip/servers",
        dto
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kmipServerQueryKeys.list() });
    }
  });
};

export const useUpdateKmipServer = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      kmipServerId,
      authMethod,
      hostnamesOrIps,
      ttl,
      keyAlgorithm
    }: TUpdateKmipServerDTO) => {
      const body: Record<string, unknown> = {};
      if (authMethod !== undefined) body.authMethod = authMethod;
      if (hostnamesOrIps !== undefined) body.hostnamesOrIps = hostnamesOrIps;
      if (ttl !== undefined) body.ttl = ttl;
      if (keyAlgorithm !== undefined) body.keyAlgorithm = keyAlgorithm;

      const { data } = await apiRequest.patch<TKmipServerWithAuthMethod>(
        `/api/v1/kmip/servers/${kmipServerId}`,
        body
      );
      return data;
    },
    onSuccess: (_, { kmipServerId }) => {
      queryClient.invalidateQueries({ queryKey: kmipServerQueryKeys.byId(kmipServerId) });
      queryClient.invalidateQueries({ queryKey: kmipServerQueryKeys.list() });
    }
  });
};

export const useGenerateKmipServerEnrollmentToken = () => {
  return useMutation({
    mutationFn: async ({ kmipServerId }: TGenerateKmipServerEnrollmentTokenDTO) => {
      const { data } = await apiRequest.post<{ token: string; expiresAt: string }>(
        `/api/v1/kmip/servers/${kmipServerId}/token-auth/generate-enrollment-token`
      );
      return data;
    }
  });
};

export const useRevokeKmipServerAccess = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ kmipServerId }: TRevokeKmipServerAccessDTO) => {
      const { data } = await apiRequest.post<{ method: string; deletedTokenCount: number }>(
        `/api/v1/kmip/servers/${kmipServerId}/revoke`
      );
      return data;
    },
    onSuccess: (_, { kmipServerId }) => {
      queryClient.invalidateQueries({ queryKey: kmipServerQueryKeys.byId(kmipServerId) });
      queryClient.invalidateQueries({ queryKey: kmipServerQueryKeys.list() });
    }
  });
};
