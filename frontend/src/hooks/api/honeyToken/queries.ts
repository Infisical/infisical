import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { HoneyTokenType, THoneyTokenConfigResponse } from "./types";

export const honeyTokenKeys = {
  config: (type: HoneyTokenType) => ["honey-token", "config", type] as const
};

export const useGetHoneyTokenConfig = (
  type: HoneyTokenType,
  options?: Omit<
    UseQueryOptions<
      THoneyTokenConfigResponse,
      unknown,
      THoneyTokenConfigResponse,
      ReturnType<typeof honeyTokenKeys.config>
    >,
    "queryKey" | "queryFn"
  >
) =>
  useQuery({
    queryKey: honeyTokenKeys.config(type),
    queryFn: async () => {
      const { data } = await apiRequest.get<THoneyTokenConfigResponse>(
        `/api/v1/honey-tokens/${type}/configs`
      );
      return data;
    },
    ...options
  });
