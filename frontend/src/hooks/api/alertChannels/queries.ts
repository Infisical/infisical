import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TAlertChannel, TListAlertChannelsDTO } from "./types";

export const alertChannelKeys = {
  all: ["alert-channels"] as const,
  list: (filters: TListAlertChannelsDTO) => [...alertChannelKeys.all, "list", filters] as const,
  byId: (channelId: string) => [...alertChannelKeys.all, channelId] as const
};

const fetchAlertChannels = async (filters: TListAlertChannelsDTO) => {
  const { data } = await apiRequest.get<{ channels: TAlertChannel[] }>("/api/v1/alert-channels", {
    params: filters
  });
  return data.channels;
};

export const useListAlertChannels = (
  filters: TListAlertChannelsDTO,
  options?: Omit<
    UseQueryOptions<
      TAlertChannel[],
      unknown,
      TAlertChannel[],
      ReturnType<typeof alertChannelKeys.list>
    >,
    "queryKey" | "queryFn"
  >
) =>
  useQuery({
    queryKey: alertChannelKeys.list(filters),
    queryFn: () => fetchAlertChannels(filters),
    ...options
  });

const fetchAlertChannelById = async (channelId: string) => {
  const { data } = await apiRequest.get<{ channel: TAlertChannel }>(
    `/api/v1/alert-channels/${channelId}`
  );
  return data.channel;
};

export const useGetAlertChannelById = (
  channelId: string,
  options?: Omit<
    UseQueryOptions<
      TAlertChannel,
      unknown,
      TAlertChannel,
      ReturnType<typeof alertChannelKeys.byId>
    >,
    "queryKey" | "queryFn"
  >
) =>
  useQuery({
    queryKey: alertChannelKeys.byId(channelId),
    queryFn: () => fetchAlertChannelById(channelId),
    enabled: Boolean(channelId),
    ...options
  });
