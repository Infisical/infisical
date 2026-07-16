import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { alarmKeys } from "./queries";
import { TAlarm, TCreateAlarmDTO, TDeleteAlarmDTO, TUpdateAlarmDTO } from "./types";

export const useCreateAlarm = () => {
  const queryClient = useQueryClient();

  return useMutation<TAlarm, unknown, TCreateAlarmDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post<{ alarm: TAlarm }>("/api/v1/alarms", dto);
      return data.alarm;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alarmKeys.all });
    }
  });
};

export const useUpdateAlarm = () => {
  const queryClient = useQueryClient();

  return useMutation<TAlarm, unknown, TUpdateAlarmDTO>({
    mutationFn: async ({ alarmId, projectId, ...body }) => {
      const { data } = await apiRequest.patch<{ alarm: TAlarm }>(`/api/v1/alarms/${alarmId}`, body);
      return data.alarm;
    },
    onSuccess: (_, { alarmId }) => {
      queryClient.invalidateQueries({ queryKey: alarmKeys.all });
      queryClient.invalidateQueries({ queryKey: alarmKeys.byId(alarmId) });
    }
  });
};

export const useDeleteAlarm = () => {
  const queryClient = useQueryClient();

  return useMutation<{ id: string }, unknown, TDeleteAlarmDTO>({
    mutationFn: async ({ alarmId }) => {
      const { data } = await apiRequest.delete<{ alarm: { id: string } }>(
        `/api/v1/alarms/${alarmId}`
      );
      return data.alarm;
    },
    onSuccess: (_, { alarmId }) => {
      queryClient.invalidateQueries({ queryKey: alarmKeys.all });
      queryClient.removeQueries({ queryKey: alarmKeys.byId(alarmId) });
    }
  });
};
