import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { HoneyTokenType, TAwsHoneyTokenDeploymentOption, THoneyTokenConfig } from "./types";

export const honeyTokenKeys = {
  config: (type: HoneyTokenType) => ["honey-token", "config", type] as const,
  // Under the AWS config key, so saving or testing the AWS setup also refreshes these.
  awsDeploymentOptions: () =>
    [...honeyTokenKeys.config(HoneyTokenType.AWS), "deployment-options"] as const
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

export const useListAwsHoneyTokenDeploymentOptions = (
  options?: Omit<
    UseQueryOptions<
      TAwsHoneyTokenDeploymentOption[],
      unknown,
      TAwsHoneyTokenDeploymentOption[],
      ReturnType<typeof honeyTokenKeys.awsDeploymentOptions>
    >,
    "queryKey" | "queryFn"
  >
) =>
  useQuery({
    queryKey: honeyTokenKeys.awsDeploymentOptions(),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        deploymentOptions: TAwsHoneyTokenDeploymentOption[];
      }>(`/api/v1/honey-tokens/${HoneyTokenType.AWS}/deployment-options`);
      return data.deploymentOptions;
    },
    ...options
  });
