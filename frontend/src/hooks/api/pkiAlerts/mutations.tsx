import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { projectKeys } from "../projects";
import { pkiAlertKeys } from "./queries";
import { TCreatePkiAlertDTO, TDeletePkiAlertDTO, TPkiAlert, TUpdatePkiAlertDTO } from "./types";

// TODO: DEPRECATE
export const useCreatePkiAlert = () => {
  const queryClient = useQueryClient();
  return useMutation<TPkiAlert, object, TCreatePkiAlertDTO>({
    mutationFn: async (body) => {
      const { data: alert } = await apiRequest.post<TPkiAlert>("/api/v1/pki/alerts", body);
      return alert;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.getProjectPkiAlerts(projectId) });
    }
  });
};

// TODO: DEPRECATE
export const useUpdatePkiAlert = () => {
  const queryClient = useQueryClient();
  return useMutation<TPkiAlert, object, TUpdatePkiAlertDTO>({
    mutationFn: async ({ alertId, ...body }) => {
      const { data: alert } = await apiRequest.patch<TPkiAlert>(
        `/api/v1/pki/alerts/${alertId}`,
        body
      );
      return alert;
    },
    onSuccess: (_, { projectId, alertId }) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.getProjectPkiAlerts(projectId) });
      queryClient.invalidateQueries({ queryKey: pkiAlertKeys.getPkiAlertById(alertId) });
    }
  });
};

// TODO: DEPRECATE
export const useDeletePkiAlert = () => {
  const queryClient = useQueryClient();
  return useMutation<TPkiAlert, object, TDeletePkiAlertDTO>({
    mutationFn: async ({ alertId }) => {
      const { data: alert } = await apiRequest.delete<TPkiAlert>(`/api/v1/pki/alerts/${alertId}`);
      return alert;
    },
    onSuccess: (_, { projectId, alertId }) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.getProjectPkiAlerts(projectId) });
      queryClient.invalidateQueries({ queryKey: pkiAlertKeys.getPkiAlertById(alertId) });
    }
  });
};
