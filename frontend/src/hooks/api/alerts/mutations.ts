import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { alertKeys } from "./queries";
import {
  TAlert,
  TCreateAlertDTO,
  TTestAlertChannelDTO,
  TTestAlertChannelResponse,
  TUpdateAlertDTO
} from "./types";

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
    mutationFn: async ({ alertId, ...body }) => {
      const { data } = await apiRequest.patch<{ alert: TAlert }>(`/api/v1/alerts/${alertId}`, body);
      return data.alert;
    },
    onSuccess: (updatedAlert) => {
      // Patch cached lists in place so status indicators reflect the change immediately
      // instead of showing stale state until the invalidation refetch completes.
      queryClient.setQueriesData<TAlert[]>({ queryKey: alertKeys.all }, (alerts) =>
        alerts?.map((alert) => (alert.id === updatedAlert.id ? updatedAlert : alert))
      );
      queryClient.invalidateQueries({ queryKey: alertKeys.all });
    }
  });
};

export const useTestAlertChannel = () =>
  useMutation<TTestAlertChannelResponse, unknown, TTestAlertChannelDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post<TTestAlertChannelResponse>(
        "/api/v1/alerts/channels/test",
        dto
      );
      return data;
    }
  });

export const useDeleteAlert = () => {
  const queryClient = useQueryClient();

  return useMutation<{ id: string }, unknown, { alertId: string }>({
    mutationFn: async ({ alertId }) => {
      const { data } = await apiRequest.delete<{ alert: { id: string } }>(
        `/api/v1/alerts/${alertId}`
      );
      return data.alert;
    },
    onSuccess: (deletedAlert) => {
      // Drop the alert from cached lists immediately so the header status dot clears
      // without waiting for the invalidation refetch.
      queryClient.setQueriesData<TAlert[]>({ queryKey: alertKeys.all }, (alerts) =>
        alerts?.filter((alert) => alert.id !== deletedAlert.id)
      );
      queryClient.invalidateQueries({ queryKey: alertKeys.all });
    }
  });
};
