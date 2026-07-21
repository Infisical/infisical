import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { alertKeys } from "./queries";
import { TAlert, TCreateAlertDTO, TUpdateAlertDTO } from "./types";

export const useCreateAlert = () => {
  const queryClient = useQueryClient();

  return useMutation<TAlert, unknown, TCreateAlertDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post<{ alert: TAlert }>("/api/v1/alerts", dto);
      return data.alert;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alertKeys.all });
    }
  });
};

export const useUpdateAlert = () => {
  const queryClient = useQueryClient();

  return useMutation<TAlert, unknown, TUpdateAlertDTO>({
    mutationFn: async ({ alertId, projectId, ...body }) => {
      const { data } = await apiRequest.patch<{ alert: TAlert }>(`/api/v1/alerts/${alertId}`, body);
      return data.alert;
    },
    onSuccess: (_, { alertId }) => {
      queryClient.invalidateQueries({ queryKey: alertKeys.all });
      queryClient.invalidateQueries({ queryKey: alertKeys.byId(alertId) });
    }
  });
};

export const useDeleteAlert = () => {
  const queryClient = useQueryClient();

  return useMutation<{ id: string }, unknown, { alertId: string }>({
    mutationFn: async ({ alertId }) => {
      const { data } = await apiRequest.delete<{ alert: { id: string } }>(
        `/api/v1/alerts/${alertId}`
      );
      return data.alert;
    },
    onSuccess: (_, { alertId }) => {
      queryClient.invalidateQueries({ queryKey: alertKeys.all });
      queryClient.invalidateQueries({ queryKey: alertKeys.byId(alertId) });
    }
  });
};
