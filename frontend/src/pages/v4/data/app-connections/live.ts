import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { useDeleteGitHubApp } from "@app/hooks/api/gitHubApps/mutations";
import { gitHubAppKeys } from "@app/hooks/api/gitHubApps/queries";

import type { AppConnectionsAdapter, TGitHubAppManifest } from "./contract";

export const appConnectionsLive: AppConnectionsAdapter = {
  useInitiateGitHubAppManifest: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async (dto) => {
        const { data } = await apiRequest.post<TGitHubAppManifest>(
          "/api/v1/github-apps/manifest/initiate",
          dto
        );
        return data;
      },
      onSettled: () => queryClient.invalidateQueries({ queryKey: gitHubAppKeys.all })
    });
  },
  useDeleteGitHubApp
};
