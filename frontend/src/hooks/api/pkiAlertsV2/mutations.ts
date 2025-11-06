import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { pkiAlertsV2Keys } from "./queries";
import { TCreatePkiAlertV2, TDeletePkiAlertV2, TPkiAlertV2, TUpdatePkiAlertV2 } from "./types";

export const useCreatePkiAlertV2 = () => {
  const queryClient = useQueryClient();

  return useMutation<TPkiAlertV2, unknown, TCreatePkiAlertV2>({
    mutationFn: async (data) => {
      const { data: response } = await apiRequest.post<TPkiAlertV2>("/api/v2/pki/alerts", data);
      return response;
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
      const { data: response } = await apiRequest.patch<TPkiAlertV2>(
        `/api/v2/pki/alerts/${alertId}`,
        data
      );
      return response;
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
      const { data } = await apiRequest.delete<TPkiAlertV2>(`/api/v2/pki/alerts/${alertId}`);
      return data;
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
