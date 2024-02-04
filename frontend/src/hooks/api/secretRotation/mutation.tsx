import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { secretRotationKeys } from "./queries";
import {
  TCreateSecretRotationDTO,
  TDeleteSecretRotationDTO,
  TRestartSecretRotationDTO
} from "./types";

export const useCreateSecretRotation = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TCreateSecretRotationDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post("/api/v1/secret-rotations", dto);
      return data;
    },
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries(secretRotationKeys.list({ workspaceId }));
    }
  });
};

export const useDeleteSecretRotation = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TDeleteSecretRotationDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.delete(`/api/v1/secret-rotations/${dto.id}`);
      return data;
    },
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries(secretRotationKeys.list({ workspaceId }));
    }
  });
};

export const useRestartSecretRotation = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TRestartSecretRotationDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post("/api/v1/secret-rotations/restart", { id: dto.id });
      return data;
    },
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries(secretRotationKeys.list({ workspaceId }));
    }
  });
};
