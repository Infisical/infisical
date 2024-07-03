import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TConsumerSecret,
  TViewConsumerSecretResponse
} from "./types";

export const useGetConsumerSecrets = () => {
  return useQuery({
    queryKey: ["consumerSecrets"],
    queryFn: async () => {
      const { data } = await apiRequest.get<TConsumerSecret[]>("/api/v1/consumer-secrets/");
      return data;
    }
  });
};

export const useGetConsumerSecretById = (id: string) => {
  return useQuery<TViewConsumerSecretResponse, [string]>({
    queryKey: ["consumerSecret", id],
    queryFn: async () => {
      if (!id) return Promise.resolve({});
      const { data } = await apiRequest.get<TViewConsumerSecretResponse>(
        `/api/v1/consumer-secrets/${id}`
      );
      return data;
    }
  });
};
