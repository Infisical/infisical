import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { dashboardKeys } from "@app/hooks/api/dashboard/queries";

import {
  TCreateHoneyTokenDTO,
  TCreateHoneyTokenResponse,
  THoneyToken,
  TRevokeHoneyTokenDTO,
  TUpdateHoneyTokenDTO
} from "./types";

export const useCreateHoneyToken = () => {
  const queryClient = useQueryClient();

  return useMutation<TCreateHoneyTokenResponse, object, TCreateHoneyTokenDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post<TCreateHoneyTokenResponse>(
        "/api/v1/honey-tokens",
        dto
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["honeyTokens"] });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all() });
    }
  });
};

export const useUpdateHoneyToken = () => {
  const queryClient = useQueryClient();

  return useMutation<THoneyToken, object, TUpdateHoneyTokenDTO>({
    mutationFn: async ({ honeyTokenId, ...dto }) => {
      const { data } = await apiRequest.patch<{ honeyToken: THoneyToken }>(
        `/api/v1/honey-tokens/${honeyTokenId}`,
        dto
      );
      return data.honeyToken;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["honeyTokens"] });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all() });
    }
  });
};

export const useResetHoneyToken = () => {
  const queryClient = useQueryClient();

  return useMutation<
    { honeyToken: { id: string; status: string; lastResetAt: string | null } },
    object,
    { honeyTokenId: string; projectId: string }
  >({
    mutationFn: async ({ honeyTokenId, projectId }) => {
      const { data } = await apiRequest.post<{
        honeyToken: { id: string; status: string; lastResetAt: string | null };
      }>(`/api/v1/honey-tokens/${honeyTokenId}/reset`, { projectId });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["honeyTokens"] });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all() });
    }
  });
};

export const useRevokeHoneyToken = () => {
  const queryClient = useQueryClient();

  return useMutation<{ honeyTokenId: string }, object, TRevokeHoneyTokenDTO>({
    mutationFn: async ({ honeyTokenId, projectId }) => {
      const { data } = await apiRequest.post<{ honeyTokenId: string }>(
        `/api/v1/honey-tokens/${honeyTokenId}/revoke`,
        { projectId }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["honeyTokens"] });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all() });
    }
  });
};
