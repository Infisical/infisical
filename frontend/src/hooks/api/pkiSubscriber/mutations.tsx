import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { workspaceKeys } from "../workspace/query-keys";
import {
  TCreatePkiSubscriberDTO,
  TDeletePkiSubscriberDTO,
  TPkiSubscriber,
  TUpdatePkiSubscriberDTO
} from "./types";

export const useCreatePkiSubscriber = () => {
  const queryClient = useQueryClient();
  return useMutation<TPkiSubscriber, object, TCreatePkiSubscriberDTO>({
    mutationFn: async (body) => {
      const { data: subscriber } = await apiRequest.post("/api/v1/pki/subscribers", body);
      return subscriber;
    },
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.getWorkspacePkiSubscribers(projectId)
      });
    }
  });
};

export const useUpdatePkiSubscriber = () => {
  const queryClient = useQueryClient();
  return useMutation<TPkiSubscriber, object, TUpdatePkiSubscriberDTO>({
    mutationFn: async ({ subscriberId, ...body }) => {
      const { data: subscriber } = await apiRequest.patch(
        `/api/v1/pki/subscribers/${subscriberId}`,
        body
      );
      return subscriber;
    },
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.getWorkspacePkiSubscribers(projectId)
      });
    }
  });
};

export const useDeletePkiSubscriber = () => {
  const queryClient = useQueryClient();
  return useMutation<TPkiSubscriber, object, TDeletePkiSubscriberDTO>({
    mutationFn: async ({ subscriberId }) => {
      const { data: subscriber } = await apiRequest.delete(
        `/api/v1/pki/subscribers/${subscriberId}`
      );
      return subscriber;
    },
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.getWorkspacePkiSubscribers(projectId)
      });
    }
  });
};
