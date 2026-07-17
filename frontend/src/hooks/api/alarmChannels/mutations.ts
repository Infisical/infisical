import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { alarmKeys } from "../alarms/queries";
import { alarmChannelKeys } from "./queries";
import {
  TAlarmChannel,
  TCreateAlarmChannelDTO,
  TDeleteAlarmChannelDTO,
  TUpdateAlarmChannelDTO
} from "./types";

export const useCreateAlarmChannel = () => {
  const queryClient = useQueryClient();

  return useMutation<TAlarmChannel, unknown, TCreateAlarmChannelDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post<{ channel: TAlarmChannel }>(
        "/api/v1/alarm-channels",
        dto
      );
      return data.channel;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alarmChannelKeys.all });
    }
  });
};

export const useUpdateAlarmChannel = () => {
  const queryClient = useQueryClient();

  return useMutation<TAlarmChannel, unknown, TUpdateAlarmChannelDTO>({
    mutationFn: async ({ channelId, projectId, ...body }) => {
      const { data } = await apiRequest.patch<{ channel: TAlarmChannel }>(
        `/api/v1/alarm-channels/${channelId}`,
        body
      );
      return data.channel;
    },
    onSuccess: (_, { channelId }) => {
      queryClient.invalidateQueries({ queryKey: alarmChannelKeys.all });
      queryClient.invalidateQueries({ queryKey: alarmChannelKeys.byId(channelId) });
      // A channel's directed/enabled state shows up in alarm summaries.
      queryClient.invalidateQueries({ queryKey: alarmKeys.all });
    }
  });
};

export const useDeleteAlarmChannel = () => {
  const queryClient = useQueryClient();

  return useMutation<{ id: string }, unknown, TDeleteAlarmChannelDTO>({
    mutationFn: async ({ channelId }) => {
      const { data } = await apiRequest.delete<{ channel: { id: string } }>(
        `/api/v1/alarm-channels/${channelId}`
      );
      return data.channel;
    },
    onSuccess: (_, { channelId }) => {
      queryClient.invalidateQueries({ queryKey: alarmChannelKeys.all });
      queryClient.removeQueries({ queryKey: alarmChannelKeys.byId(channelId) });
      // Deleting a channel detaches it from alarms.
      queryClient.invalidateQueries({ queryKey: alarmKeys.all });
    }
  });
};
