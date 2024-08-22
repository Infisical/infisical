import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TRateLimit } from "./types";

export const rateLimitQueryKeys = {
  rateLimit: () => ["rate-limit"] as const
};

const fetchRateLimit = async () => {
  const { data } = await apiRequest.get<{ rateLimit: TRateLimit }>("/api/v1/rate-limit");
  return data.rateLimit;
};

export const useGetRateLimit = ({
  options = {}
}: {
  options?: Omit<
    UseQueryOptions<
      TRateLimit,
      unknown,
      TRateLimit,
      ReturnType<typeof rateLimitQueryKeys.rateLimit>
    >,
    "queryKey" | "queryFn"
  >;
} = {}) =>
  useQuery({
    queryKey: rateLimitQueryKeys.rateLimit(),
    queryFn: fetchRateLimit,
    ...options,
    enabled: options?.enabled ?? true
  });
