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
    onMutate: async (releaseIds) => {
      await queryClient.cancelQueries({ queryKey: featureDiscoveryKeys.all });
      const createdAt = new Date().toISOString();
      queryClient.setQueryData<TFeatureDiscovery[]>(featureDiscoveryKeys.all, (prev = []) => [
        ...prev,
        ...releaseIds.map((releaseId) => ({ releaseId, createdAt }))
      ]);
    },
    // Merge rather than replace: overlapping saves can resolve out of order.
    onSuccess: (featureDiscoveries) => {
      queryClient.setQueryData<TFeatureDiscovery[]>(featureDiscoveryKeys.all, (prev = []) => {
        const saved = new Set(featureDiscoveries.map(({ releaseId }) => releaseId));
        return [...featureDiscoveries, ...prev.filter(({ releaseId }) => !saved.has(releaseId))];
      });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: featureDiscoveryKeys.all });
    }
  });
};
