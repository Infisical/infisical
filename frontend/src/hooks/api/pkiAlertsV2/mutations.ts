import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { pkiAlertsV2Keys } from "./queries";
import { TCreatePkiAlertV2, TDeletePkiAlertV2, TPkiAlertV2, TUpdatePkiAlertV2 } from "./types";

export const useCreatePkiAlertV2 = () => {
  const queryClient = useQueryClient();

  return useMutation<TPkiAlertV2, unknown, TCreatePkiAlertV2>({
    mutationFn: async (data) => {
      const { data: response } = await apiRequest.post<{ alert: TPkiAlertV2 }>(
        "/api/v1/cert-manager/alerts",
        data
      );
      return response.alert;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: pkiAlertsV2Keys.allPkiAlertsV2({ projectId: variables.projectId })
      });
    }
  });
};

export const useUpdatePkiAlertV2 = () => {
  const queryClient = useQueryClient();

  return useMutation<TPkiAlertV2, unknown, TUpdatePkiAlertV2>({
    mutationFn: async ({ alertId, ...data }) => {
      const { data: response } = await apiRequest.patch<{ alert: TPkiAlertV2 }>(
        `/api/v1/cert-manager/alerts/${alertId}`,
        data
      );
      return response.alert;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: pkiAlertsV2Keys.specificPkiAlertV2(variables.alertId)
      });
      queryClient.invalidateQueries({
        queryKey: pkiAlertsV2Keys.all
      });
    }
  });
};

export const useDeletePkiAlertV2 = () => {
  const queryClient = useQueryClient();

  return useMutation<TPkiAlertV2, unknown, TDeletePkiAlertV2>({
    mutationFn: async ({ alertId }) => {
      const { data } = await apiRequest.delete<{ alert: TPkiAlertV2 }>(
        `/api/v1/cert-manager/alerts/${alertId}`
      );
      return data.alert;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: pkiAlertsV2Keys.all
      });
      queryClient.removeQueries({
        queryKey: pkiAlertsV2Keys.specificPkiAlertV2(variables.alertId)
      });
    }
  });
};
