import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TPkiAlert } from "./types";

export const pkiAlertKeys = {
  getPkiAlertById: (alertId: string) => [{ alertId }, "alert"]
};

// TODO: DEPRECATE
export const useGetPkiAlertById = (alertId: string) => {
  return useQuery({
    queryKey: pkiAlertKeys.getPkiAlertById(alertId),
    queryFn: async () => {
      const { data: alert } = await apiRequest.get<TPkiAlert>(`/api/v1/pki/alerts/${alertId}`);
      return alert;
    },
    enabled: Boolean(alertId)
  });
};
