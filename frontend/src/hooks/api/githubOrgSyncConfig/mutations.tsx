import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { githubOrgSyncConfigQueryKeys } from "./queries";
import { TCreateGithubOrgSyncDTO, TUpdateGithubOrgSyncDTO } from "./types";

export const useCreateGithubSyncOrgConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: TCreateGithubOrgSyncDTO) => {
      return apiRequest.post("/api/v1/github-org-sync-config", dto);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(githubOrgSyncConfigQueryKeys.get());
    }
  });
};

export const useUpdateGithubSyncOrgConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: TUpdateGithubOrgSyncDTO) => {
      return apiRequest.patch("/api/v1/github-org-sync-config", dto);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(githubOrgSyncConfigQueryKeys.get());
    }
  });
};

export const useDeleteGithubSyncOrgConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => {
      return apiRequest.delete("/api/v1/github-org-sync-config");
    },
    onSuccess: () => {
      queryClient.invalidateQueries(githubOrgSyncConfigQueryKeys.get());
    }
  });
};

export const useSyncAllGithubTeams = () => {
  return useMutation({
    mutationFn: async ({
      githubOrgAccessToken
    }: {
      githubOrgAccessToken?: string;
    } = {}): Promise<{
      syncedUsersCount: number;
      skippedUsersCount: number;
      totalUsers: number;
      errors: string[];
      createdTeams: string[];
      updatedTeams: string[];
      removedMemberships: number;
      syncDuration: number;
    }> => {
      const response = await apiRequest.post("/api/v1/github-org-sync-config/sync-all-teams", {
        githubOrgAccessToken
      });
      return response.data;
    }
  });
};

export const useValidateGithubToken = () => {
  return useMutation({
    mutationFn: async ({
      githubOrgAccessToken
    }: {
      githubOrgAccessToken: string;
    }): Promise<{
      valid: boolean;
      organizationInfo?: {
        id: number;
        login: string;
        name: string;
        publicRepos?: number;
        privateRepos?: number;
      };
    }> => {
      const response = await apiRequest.post("/api/v1/github-org-sync-config/validate-token", {
        githubOrgAccessToken
      });
      return response.data;
    }
  });
};
