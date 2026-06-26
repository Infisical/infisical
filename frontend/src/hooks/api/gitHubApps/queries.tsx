import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TGitHubApp } from "./types";

export const gitHubAppKeys = {
  all: ["github-apps"] as const,
  list: (orgId?: string, projectId?: string | null) =>
    [...gitHubAppKeys.all, "list", orgId, projectId ?? null] as const
};

const fetchGitHubApps = async (projectId?: string) => {
  const { data } = await apiRequest.get<{ gitHubApps: TGitHubApp[] }>("/api/v1/github-apps", {
    params: projectId ? { projectId } : undefined
  });
  return data.gitHubApps;
};

export const useListGitHubApps = (orgId?: string, projectId?: string | null) =>
  useQuery({
    queryKey: gitHubAppKeys.list(orgId, projectId),
    queryFn: () => fetchGitHubApps(projectId ?? undefined),
    enabled: Boolean(orgId),
    retry: false
  });
