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

// Imperative check used when connecting: already-installed apps must skip GitHub's install page
// (it never redirects back to Infisical) and go through the OAuth authorize flow instead.
export const fetchGitHubAppInstallationStatus = async (params: {
  gitHubAppId?: string;
  host?: string;
  instanceType?: "cloud" | "server";
}) => {
  const { data } = await apiRequest.get<{ installed: boolean; clientId: string }>(
    "/api/v1/github-apps/installation-status",
    { params }
  );
  return data;
};

export const useListGitHubApps = (orgId?: string) =>
  useQuery({
    queryKey: gitHubAppKeys.list(orgId),
    queryFn: fetchGitHubApps,
    enabled: Boolean(orgId),
    retry: false
  });
