import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

export interface GitHubVersion {
  tagName: string;
  name: string;
  publishedAt: string;
  prerelease: boolean;
  draft: boolean;
}

export interface UpgradePathResult {
  path: Array<{
    version: string;
    name: string;
    publishedAt: string;
    prerelease: boolean;
  }>;
  breakingChanges: Array<{
    version: string;
    changes: Array<{
      title: string;
      description: string;
      action: string;
    }>;
  }>;
  features: Array<{
    version: string;
    name: string;
    body: string;
    publishedAt: string;
  }>;
  hasDbMigration: boolean;
  config: Record<string, unknown>;
}

export interface GetUpgradePathVersionsParams {
  includePrerelease?: boolean;
}

export interface CalculateUpgradePathParams {
  fromVersion: string;
  toVersion: string;
  includePrerelease?: boolean;
}

const upgradePathKeys = {
  all: ["upgrade-path"] as const,
  versions: (params: GetUpgradePathVersionsParams) =>
    [...upgradePathKeys.all, "versions", params] as const,
  calculate: (params: CalculateUpgradePathParams) =>
    [...upgradePathKeys.all, "calculate", params] as const
};

export const useGetUpgradePathVersions = (
  params: GetUpgradePathVersionsParams,
  options?: Omit<UseQueryOptions<{ versions: GitHubVersion[] }>, "queryKey" | "queryFn">
) => {
  return useQuery({
    queryKey: upgradePathKeys.versions(params),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ versions: GitHubVersion[] }>(
        "/api/v1/upgrade-path/versions",
        {
          params
        }
      );
      return data;
    },
    ...options
  });
};

export const useCalculateUpgradePath = () => {
  return async (params: CalculateUpgradePathParams): Promise<UpgradePathResult> => {
    const { data } = await apiRequest.post<UpgradePathResult>(
      "/api/v1/upgrade-path/calculate",
      params
    );
    return data;
  };
};
