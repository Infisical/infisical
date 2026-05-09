import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { honeyTokenKeys } from "./queries";
import { HoneyTokenType, TUpsertHoneyTokenConfigDTO } from "./types";

export const useUpsertHoneyTokenConfig = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: TUpsertHoneyTokenConfigDTO) => {
      const { data } = await apiRequest.put(`/api/v1/honey-tokens/${dto.type}/configs`, {
        connectionId: dto.connectionId,
        config: dto.config
      });
      return data.config;
    },
    onSuccess: (_, dto) => {
      queryClient.invalidateQueries({ queryKey: honeyTokenKeys.config(dto.type) });
    }
  });
};

export const useTestHoneyTokenConnection = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (type: HoneyTokenType) => {
      const { data } = await apiRequest.post<{
        isConnected: boolean;
        status: string | null;
        stackName: string;
      }>(`/api/v1/honey-tokens/${type}/configs/test-connection`);
      return data;
    },
    onSettled: (_, __, type) => {
      queryClient.invalidateQueries({ queryKey: honeyTokenKeys.config(type) });
    }
  });
};
