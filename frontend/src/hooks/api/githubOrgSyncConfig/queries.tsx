import { queryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TGithubOrgSyncConfig } from "./types";

export const githubOrgSyncConfigQueryKeys = {
  allKey: () => ["github-org-sync-config"],
  getKey: () => [...githubOrgSyncConfigQueryKeys.allKey(), "list"],
  get: () =>
    queryOptions({
      queryKey: githubOrgSyncConfigQueryKeys.getKey(),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ githubOrgSyncConfig: TGithubOrgSyncConfig }>(
          "/api/v1/github-org-sync-config"
        );
        return data.githubOrgSyncConfig;
      }
    })
};
