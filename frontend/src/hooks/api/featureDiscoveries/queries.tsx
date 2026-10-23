import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TFeatureDiscoveriesResponse } from "./types";

export const featureDiscoveryKeys = {
  all: ["feature-discoveries"] as const
};

export const useGetFeatureDiscoveries = () => {
  return useQuery({
    queryKey: featureDiscoveryKeys.all,
    queryFn: async () => {
      const { data } = await apiRequest.get<TFeatureDiscoveriesResponse>(
        "/api/v1/feature-discoveries"
      );
      return data.featureDiscoveries;
    },
    staleTime: Infinity
  });
};
