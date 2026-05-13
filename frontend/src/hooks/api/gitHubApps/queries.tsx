import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TGitHubApp } from "./types";

export const gitHubAppKeys = {
  list: (orgId?: string) => [{ orgId }, "github-apps"] as const
};

export const fetchGitHubApps = async () => {
  const { data } = await apiRequest.get<{ gitHubApps: TGitHubApp[] }>("/api/v1/github-apps");

  return data.gitHubApps;
};

export const useListGitHubApps = (orgId?: string) =>
  useQuery({
    queryKey: gitHubAppKeys.list(orgId),
    queryFn: fetchGitHubApps,
    enabled: Boolean(orgId)
  });
