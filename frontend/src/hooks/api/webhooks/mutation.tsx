import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { queryKeys } from "./query";
import { TCreateWebhookDto, TDeleteWebhookDto, TTestWebhookDTO, TUpdateWebhookDto } from "./types";

export const useCreateWebhook = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TCreateWebhookDto>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post("/api/v1/webhooks", dto);
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.getWebhooks(projectId) });
    }
  });
};

export const useTestWebhook = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TTestWebhookDTO>({
    mutationFn: async ({ webhookId }) => {
      const { data } = await apiRequest.post(`/api/v1/webhooks/${webhookId}/test`, {});
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.getWebhooks(projectId) });
    },
    onError: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.getWebhooks(projectId) });
    }
  });
};

export const useUpdateWebhook = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TUpdateWebhookDto>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.patch(`/api/v1/webhooks/${dto.webhookId}`, {
        isDisabled: dto.isDisabled
      });
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.getWebhooks(projectId) });
    }
  });
};

export const useDeleteWebhook = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TDeleteWebhookDto>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.delete(`/api/v1/webhooks/${dto.webhookId}`);
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.getWebhooks(projectId) });
    }
  });
};
