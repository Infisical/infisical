import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TGitHubApp } from "./types";

export const gitHubAppKeys = {
  all: ["github-apps"] as const,
  list: (orgId?: string) => [...gitHubAppKeys.all, "list", orgId] as const
};

const fetchGitHubApps = async () => {
  const { data } = await apiRequest.get<{ gitHubApps: TGitHubApp[] }>("/api/v1/github-apps");
  return data.gitHubApps;
};

export const useListGitHubApps = (orgId?: string) =>
  useQuery({
    queryKey: gitHubAppKeys.list(orgId),
    queryFn: fetchGitHubApps,
    enabled: Boolean(orgId),
    retry: false
  });
