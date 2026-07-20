import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { alertKeys } from "../alerts/queries";
import { alertChannelKeys } from "./queries";
import {
  TAlertChannel,
  TCreateAlertChannelDTO,
  TDeleteAlertChannelDTO,
  TUpdateAlertChannelDTO
} from "./types";

export const useCreateAlertChannel = () => {
  const queryClient = useQueryClient();

  return useMutation<TAlertChannel, unknown, TCreateAlertChannelDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post<{ channel: TAlertChannel }>(
        "/api/v1/alert-channels",
        dto
      );
      return data.channel;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alertChannelKeys.all });
    }
  });
};

export const useUpdateAlertChannel = () => {
  const queryClient = useQueryClient();

  return useMutation<TAlertChannel, unknown, TUpdateAlertChannelDTO>({
    mutationFn: async ({ channelId, projectId, ...body }) => {
      const { data } = await apiRequest.patch<{ channel: TAlertChannel }>(
        `/api/v1/alert-channels/${channelId}`,
        body
      );
      return data.channel;
    },
    onSuccess: (_, { channelId }) => {
      queryClient.invalidateQueries({ queryKey: alertChannelKeys.all });
      queryClient.invalidateQueries({ queryKey: alertChannelKeys.byId(channelId) });
      // A channel's directed/enabled state shows up in alert summaries.
      queryClient.invalidateQueries({ queryKey: alertKeys.all });
    }
  });
};

export const useDeleteAlertChannel = () => {
  const queryClient = useQueryClient();

  return useMutation<{ id: string }, unknown, TDeleteAlertChannelDTO>({
    mutationFn: async ({ channelId }) => {
      const { data } = await apiRequest.delete<{ channel: { id: string } }>(
        `/api/v1/alert-channels/${channelId}`
      );
      return data.channel;
    },
    onSuccess: (_, { channelId }) => {
      queryClient.invalidateQueries({ queryKey: alertChannelKeys.all });
      queryClient.removeQueries({ queryKey: alertChannelKeys.byId(channelId) });
      // Deleting a channel detaches it from alerts.
      queryClient.invalidateQueries({ queryKey: alertKeys.all });
    }
  });
};
