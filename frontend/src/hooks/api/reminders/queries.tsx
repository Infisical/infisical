import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { CreateReminderDTO, DeleteReminderDTO, Reminder } from "./types";

export const reminderKeys = {
  getReminder: (secretId: string) => ["get-reminder", secretId] as const
};

export const useCreateReminder = (secretId: string) => {
  const queryClient = useQueryClient();

  return useMutation<Reminder, object, CreateReminderDTO>({
    mutationFn: async ({ message, repeatDays, nextReminderDate, recipients }) => {
      const { data } = await apiRequest.post<{ reminder: Reminder }>(
        `/api/v1/reminders/secrets/${secretId}`,
        {
          message,
          repeatDays,
          nextReminderDate,
          recipients
        }
      );
      return data.reminder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reminderKeys.getReminder(secretId) });
    }
  });
};

export const useDeleteReminder = (secretId: string) => {
  const queryClient = useQueryClient();

  return useMutation<Reminder, object, DeleteReminderDTO>({
    mutationFn: async () => {
      const { data } = await apiRequest.delete<{ reminder: Reminder }>(
        `/api/v1/reminders/secrets/${secretId}`
      );
      return data.reminder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reminderKeys.getReminder(secretId) });
    }
  });
};

export const useGetReminder = (secretId: string) => {
  return useQuery({
    queryKey: reminderKeys.getReminder(secretId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ reminder: Reminder }>(
        `/api/v1/reminders/secrets/${secretId}`
      );
      return data.reminder;
    },
    enabled: Boolean(secretId)
  });
};
