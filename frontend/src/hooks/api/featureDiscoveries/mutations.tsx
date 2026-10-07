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
    // The cache is only ever changed per release: added optimistically here, and removed again
    // in onError if this save fails. Responses never overwrite it, so overlapping saves can't
    // clobber each other.
    onMutate: async (releaseIds) => {
      await queryClient.cancelQueries({ queryKey: featureDiscoveryKeys.all });
      const createdAt = new Date().toISOString();
      queryClient.setQueryData<TFeatureDiscovery[]>(featureDiscoveryKeys.all, (prev = []) => [
        ...prev,
        ...releaseIds.map((releaseId) => ({ releaseId, createdAt }))
      ]);
    },
    onError: (_error, releaseIds) => {
      queryClient.setQueryData<TFeatureDiscovery[]>(featureDiscoveryKeys.all, (prev = []) =>
        prev.filter(({ releaseId }) => !releaseIds.includes(releaseId))
      );
    }
  });
};
