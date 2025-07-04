import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { CreateReminderDTO, DeleteReminderDTO, Reminder } from "./types";

export const reminderKeys = {
  getReminder: (secretId: string, projectId: string) =>
    ["get-reminder", secretId, projectId] as const
};

export const useCreateReminder = (secretId: string, projectId: string) => {
  const queryClient = useQueryClient();

  return useMutation<Reminder, object, CreateReminderDTO>({
    mutationFn: async ({ message, repeatDays, nextReminderDate, recipients }) => {
      const { data } = await apiRequest.post<{ reminder: Reminder }>(
        `/api/v1/reminders/${projectId}/reminder`,
        {
          secretId,
          message,
          repeatDays,
          nextReminderDate,
          recipients
        }
      );
      return data.reminder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reminderKeys.getReminder(secretId, projectId) });
    }
  });
};

export const useDeleteReminder = (secretId: string, projectId: string) => {
  const queryClient = useQueryClient();

  return useMutation<Reminder, object, DeleteReminderDTO>({
    mutationFn: async () => {
      const { data } = await apiRequest.delete<{ reminder: Reminder }>(
        `/api/v1/reminders/${projectId}/reminder/${secretId}`
      );
      return data.reminder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reminderKeys.getReminder(secretId, projectId) });
    }
  });
};

export const useGetReminder = (secretId: string, projectId: string) => {
  return useQuery({
    queryKey: reminderKeys.getReminder(secretId, projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ reminder: Reminder }>(
        `/api/v1/reminders/${projectId}/reminder/${secretId}`
      );
      return data.reminder;
    },
    enabled: Boolean(secretId && projectId)
  });
};
