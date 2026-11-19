import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { pkiAlertsV2Keys } from "./queries";
import { TDeletePkiAlertV2, TPkiAlertV2 } from "./types";

export const useDeletePkiAlertV2 = () => {
  const queryClient = useQueryClient();

  return useMutation<TPkiAlertV2, unknown, TDeletePkiAlertV2 & { applicationId?: string }>({
    mutationFn: async ({ alertId, applicationId }) => {
      if (applicationId) {
        const { data } = await apiRequest.delete<{ alert: TPkiAlertV2 }>(
          `/api/v1/cert-manager/applications/${applicationId}/alerts/${alertId}`
        );
        return data.alert;
      }
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
