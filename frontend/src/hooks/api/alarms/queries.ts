import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TAlarm, TListAlarmsDTO } from "./types";

export const alarmKeys = {
  all: ["alarms"] as const,
  list: (filters: TListAlarmsDTO) => [...alarmKeys.all, "list", filters] as const,
  byId: (alarmId: string) => [...alarmKeys.all, alarmId] as const
};

const fetchAlarms = async (filters: TListAlarmsDTO) => {
  const { data } = await apiRequest.get<{ alarms: TAlarm[] }>("/api/v1/alarms", {
    params: filters
  });
  return data.alarms;
};

export const useListAlarms = (
  filters: TListAlarmsDTO,
  options?: Omit<
    UseQueryOptions<TAlarm[], unknown, TAlarm[], ReturnType<typeof alarmKeys.list>>,
    "queryKey" | "queryFn"
  >
) =>
  useQuery({
    queryKey: alarmKeys.list(filters),
    queryFn: () => fetchAlarms(filters),
    ...options
  });

const fetchAlarmById = async (alarmId: string) => {
  const { data } = await apiRequest.get<{ alarm: TAlarm }>(`/api/v1/alarms/${alarmId}`);
  return data.alarm;
};

export const useGetAlarmById = (
  alarmId: string,
  options?: Omit<
    UseQueryOptions<TAlarm, unknown, TAlarm, ReturnType<typeof alarmKeys.byId>>,
    "queryKey" | "queryFn"
  >
) =>
  useQuery({
    queryKey: alarmKeys.byId(alarmId),
    queryFn: () => fetchAlarmById(alarmId),
    enabled: Boolean(alarmId),
    ...options
  });
