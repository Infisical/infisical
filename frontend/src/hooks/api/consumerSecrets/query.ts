import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TConsumerSecret } from "./types";

export const consumerSecretKeys = {
  allConsumerSecrets: ["consumerSecret"] as const,
  specificConsumerSecrets: (offset: number, limit: number) =>
    [...consumerSecretKeys.allConsumerSecrets, { offset, limit }] as const
};

const queryParamsBuilder = (offset: number, limit: number) => 
  new URLSearchParams({ offset: String(offset), limit: String(limit) });

const fetchConsumerSecrets = async (offset: number, limit: number) => {
  const params = queryParamsBuilder(offset, limit);
  const { data } = await apiRequest.get<{ secrets: TConsumerSecret[]; totalCount: number }>(
    "api/v1/consumer-secrets",
    { params }
  );
  return data;
};

export const useGetConsumerSecrets = ({
  offset = 0,
  limit = 25
}: {
  offset?: number;
  limit?: number;
}) => {
  return useQuery({
    queryKey: consumerSecretKeys.specificConsumerSecrets(offset, limit),
    queryFn: () => fetchConsumerSecrets(offset, limit),
    onError: (error) => {
      console.error("Unexpected error while fetching consumer secrets:", error);
    }
  });
};
