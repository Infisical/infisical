
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@app/config/request";
import {
  TReminders,
  TReminder,
  TCreateReminder,
  TDeleteReminder,
  TUpdateReminder
} from "./types";

const getRemindersEndpoint = (secretID: string) => `/api/v3/secrets/${secretID}/reminders`

const getRemindersDetailEndpoint = (secretID: string, reminderID: string) => getRemindersEndpoint(secretID) + `/${reminderID}`

const secretReminders = {
  getSecretReminders: (secretID: string) => ["secret-reminders", { secretID }] as const
};

const fetchSecretReminders = async (secretID: string) => {
  const { data } = await apiRequest.get<{ secretReminders: TReminders }>(
    getRemindersEndpoint(secretID)
  );

  return data.secretReminders;
};

export const useGetSecretReminders = (secretID: string) => {
  return useQuery({
    queryKey: secretReminders.getSecretReminders(secretID),
    queryFn: () => fetchSecretReminders(secretID),
    enabled: Boolean(secretID)
  });
}

export const useCreateSecretReminders = () => {
  const queryClient = useQueryClient();

  return useMutation<TReminder, {}, TCreateReminder>({
    mutationFn: async ({ secretID, frequency, note }: TCreateReminder) => {
      const { data } = await apiRequest.post(getRemindersEndpoint(secretID), { frequency, note })
      return data;
    },
    onSuccess: (reminder: TReminder) => {
      if (reminder?.secret) {
        queryClient.invalidateQueries(secretReminders.getSecretReminders(reminder?.secret));
      }
    }
  });
};

export const useUpdateSecretReminders = () => {
  const queryClient = useQueryClient();

  return useMutation<TReminder, {}, TUpdateReminder>({
    mutationFn: async ({ secretID, reminderID, frequency, note }: TUpdateReminder) => {
      const { data } = await apiRequest.patch(getRemindersDetailEndpoint(secretID, reminderID), { frequency, note })
      return data;
    },
    onSuccess: (reminder: TReminder) => {
      if (reminder?.secret) {
        queryClient.invalidateQueries(secretReminders.getSecretReminders(reminder?.secret));
      }
    }
  });
};

export const useDeleteSecretReminders = () => {
  const queryClient = useQueryClient();

  return useMutation<TReminder, {}, TDeleteReminder>({
    mutationFn: async ({ secretID, reminderID }: TDeleteReminder) => {
      const { data } = await apiRequest.delete(getRemindersDetailEndpoint(secretID, reminderID));
      return data
    },
    onSuccess: (reminder: TReminder) => {
      queryClient.invalidateQueries(secretReminders.getSecretReminders(reminder?.secret));
    }
  });
};