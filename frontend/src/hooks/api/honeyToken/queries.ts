import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { HoneyTokenType, THoneyTokenConfig } from "./types";

export const honeyTokenKeys = {
  config: (type: HoneyTokenType) => ["honey-token", "config", type] as const
};

export const useGetHoneyTokenConfig = (
  type: HoneyTokenType,
  options?: Omit<
    UseQueryOptions<
      THoneyTokenConfig | null,
      unknown,
      THoneyTokenConfig | null,
      ReturnType<typeof honeyTokenKeys.config>
    >,
    "queryKey" | "queryFn"
  >
) =>
  useQuery({
    queryKey: honeyTokenKeys.config(type),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ config: THoneyTokenConfig | null }>(
        `/api/v1/honey-tokens/${type}/configs`
      );
      return data.config;
    },
    ...options
  });
