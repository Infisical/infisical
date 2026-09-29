import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { alertKeys } from "@app/hooks/api/alerts/queries";

import { pkiAlertsV2Keys } from "./queries";
import { TDeletePkiAlertV2, TPkiAlertV2, TUpdatePkiAlertV2 } from "./types";

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
      queryClient.invalidateQueries({ queryKey: alertKeys.all });
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
      queryClient.invalidateQueries({ queryKey: alertKeys.all });
      queryClient.removeQueries({
        queryKey: pkiAlertsV2Keys.specificPkiAlertV2(variables.alertId)
      });
    }
  });
};

export interface TTestPkiWebhookConfigV2 {
  url: string;
  signingSecret?: string;
}

export interface TTestPkiWebhookConfigV2Response {
  success: boolean;
  error?: string;
}

export const useTestPkiWebhookConfigV2 = () => {
  return useMutation<TTestPkiWebhookConfigV2Response, unknown, TTestPkiWebhookConfigV2>({
    mutationFn: async ({ url, signingSecret }) => {
      const { data } = await apiRequest.post<TTestPkiWebhookConfigV2Response>(
        "/api/v2/pki/alerts/test-webhook",
        { url, signingSecret }
      );
      return data;
    }
  });
};
