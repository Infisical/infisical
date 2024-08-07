import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TAlert } from "./types";

export const alertKeys = {
  getAlertById: (alertId: string) => [{ alertId }, "alert"]
};

export const useGetAlertById = (alertId: string) => {
  return useQuery({
    queryKey: alertKeys.getAlertById(alertId),
    queryFn: async () => {
      const { data: alert } = await apiRequest.get<TAlert>(`/api/v1/alerts/${alertId}`);
      return alert;
    },
    enabled: Boolean(alertId)
  });
};
