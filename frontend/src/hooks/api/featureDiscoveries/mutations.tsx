import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { featureDiscoveryKeys } from "./queries";
import { TFeatureDiscoveriesResponse, TFeatureDiscovery } from "./types";

export const useCreateFeatureDiscoveries = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (releaseIds: string[]) => {
      const { data } = await apiRequest.post<TFeatureDiscoveriesResponse>(
        "/api/v1/feature-discoveries",
        { releaseIds }
      );
      return data.featureDiscoveries;
    },
    // Optimistic so the dots clear the moment the picker renders, not after the round trip.
    onMutate: (releaseIds) => {
      const createdAt = new Date().toISOString();
      queryClient.setQueryData<TFeatureDiscovery[]>(featureDiscoveryKeys.all, (prev = []) => [
        ...prev,
        ...releaseIds.map((releaseId) => ({ releaseId, createdAt }))
      ]);
    },
    onSuccess: (featureDiscoveries) => {
      queryClient.setQueryData(featureDiscoveryKeys.all, featureDiscoveries);
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: featureDiscoveryKeys.all });
    }
  });
};
