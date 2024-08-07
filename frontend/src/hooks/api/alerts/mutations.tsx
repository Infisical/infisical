import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { workspaceKeys } from "../workspace/queries";
import { alertKeys } from "./queries";
import { TAlert, TCreateAlertDTO, TDeleteAlertDTO,TUpdateAlertDTO } from "./types";

export const useCreateAlert = () => {
  const queryClient = useQueryClient();
  return useMutation<TAlert, {}, TCreateAlertDTO>({
    mutationFn: async (body) => {
      const { data: alert } = await apiRequest.post<TAlert>("/api/v1/alerts", body);
      return alert;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceAlerts(projectId));
    }
  });
};

export const useUpdateAlert = () => {
  const queryClient = useQueryClient();
  return useMutation<TAlert, {}, TUpdateAlertDTO>({
    mutationFn: async ({ alertId, ...body }) => {
      const { data: alert } = await apiRequest.patch<TAlert>(`/api/v1/alerts/${alertId}`, body);
      return alert;
    },
    onSuccess: (_, { projectId, alertId }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceAlerts(projectId));
      queryClient.invalidateQueries(alertKeys.getAlertById(alertId));
    }
  });
};

export const useDeleteAlert = () => {
  const queryClient = useQueryClient();
  return useMutation<TAlert, {}, TDeleteAlertDTO>({
    mutationFn: async ({ alertId }) => {
      const { data: alert } = await apiRequest.delete<TAlert>(`/api/v1/alerts/${alertId}`);
      return alert;
    },
    onSuccess: (_, { projectId, alertId }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceAlerts(projectId));
      queryClient.invalidateQueries(alertKeys.getAlertById(alertId));
    }
  });
};
