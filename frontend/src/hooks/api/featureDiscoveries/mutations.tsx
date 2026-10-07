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
    // Releases are added optimistically and removed again only if their own save fails.
    // Successful responses are merged in, never swapped in, so out-of-order saves can't drop
    // each other and a cancelled initial load still ends up with the full saved list.
    onMutate: async (releaseIds) => {
      await queryClient.cancelQueries({ queryKey: featureDiscoveryKeys.all });
      const createdAt = new Date().toISOString();
      queryClient.setQueryData<TFeatureDiscovery[]>(featureDiscoveryKeys.all, (prev = []) => [
        ...prev,
        ...releaseIds.map((releaseId) => ({ releaseId, createdAt }))
      ]);
    },
    onSuccess: (featureDiscoveries) => {
      queryClient.setQueryData<TFeatureDiscovery[]>(featureDiscoveryKeys.all, (prev = []) => {
        const cached = new Set(prev.map(({ releaseId }) => releaseId));
        return [...prev, ...featureDiscoveries.filter(({ releaseId }) => !cached.has(releaseId))];
      });
    },
    onError: (_error, releaseIds) => {
      queryClient.setQueryData<TFeatureDiscovery[]>(featureDiscoveryKeys.all, (prev = []) =>
        prev.filter(({ releaseId }) => !releaseIds.includes(releaseId))
      );
    }
  });
};
