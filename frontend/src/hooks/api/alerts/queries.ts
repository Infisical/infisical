import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TAlert, TListAlertsDTO } from "./types";

export const alertKeys = {
  all: ["alerts"] as const,
  list: (filters: TListAlertsDTO) => [...alertKeys.all, "list", filters] as const
};

const fetchAlerts = async (filters: TListAlertsDTO) => {
  const { data } = await apiRequest.get<{ alerts: TAlert[] }>("/api/v1/alerts", {
    params: filters
  });
  return data.alerts;
};

export const useListAlerts = (
  filters: TListAlertsDTO,
  options?: Omit<
    UseQueryOptions<TAlert[], unknown, TAlert[], ReturnType<typeof alertKeys.list>>,
    "queryKey" | "queryFn"
  >
) =>
  useQuery({
    queryKey: alertKeys.list(filters),
    queryFn: () => fetchAlerts(filters),
    ...options
  });
