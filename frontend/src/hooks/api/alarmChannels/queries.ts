import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TAlarmChannel, TListAlarmChannelsDTO } from "./types";

export const alarmChannelKeys = {
  all: ["alarm-channels"] as const,
  list: (filters: TListAlarmChannelsDTO) => [...alarmChannelKeys.all, "list", filters] as const,
  byId: (channelId: string) => [...alarmChannelKeys.all, channelId] as const
};

const fetchAlarmChannels = async (filters: TListAlarmChannelsDTO) => {
  const { data } = await apiRequest.get<{ channels: TAlarmChannel[] }>("/api/v1/alarm-channels", {
    params: filters
  });
  return data.channels;
};

export const useListAlarmChannels = (
  filters: TListAlarmChannelsDTO,
  options?: Omit<
    UseQueryOptions<
      TAlarmChannel[],
      unknown,
      TAlarmChannel[],
      ReturnType<typeof alarmChannelKeys.list>
    >,
    "queryKey" | "queryFn"
  >
) =>
  useQuery({
    queryKey: alarmChannelKeys.list(filters),
    queryFn: () => fetchAlarmChannels(filters),
    ...options
  });

const fetchAlarmChannelById = async (channelId: string) => {
  const { data } = await apiRequest.get<{ channel: TAlarmChannel }>(
    `/api/v1/alarm-channels/${channelId}`
  );
  return data.channel;
};

export const useGetAlarmChannelById = (
  channelId: string,
  options?: Omit<
    UseQueryOptions<
      TAlarmChannel,
      unknown,
      TAlarmChannel,
      ReturnType<typeof alarmChannelKeys.byId>
    >,
    "queryKey" | "queryFn"
  >
) =>
  useQuery({
    queryKey: alarmChannelKeys.byId(channelId),
    queryFn: () => fetchAlarmChannelById(channelId),
    enabled: Boolean(channelId),
    ...options
  });
