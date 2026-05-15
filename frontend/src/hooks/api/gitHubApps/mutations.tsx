import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TDeleteGitHubAppDTO,
  TExchangeGitHubManifestCodeDTO,
  TGitHubApp,
  TRegisterGitHubAppDTO
} from "./types";

export const useExchangeGitHubManifestCode = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: TExchangeGitHubManifestCodeDTO) => {
      const { data } = await apiRequest.post<{ gitHubApp: TGitHubApp }>(
        "/api/v1/github-apps/manifest/exchange",
        dto
      );

      return data.gitHubApp;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey.includes("github-apps")
      });
    }
  });
};

export const useRegisterGitHubApp = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: TRegisterGitHubAppDTO) => {
      const { data } = await apiRequest.post<{ gitHubApp: TGitHubApp }>(
        "/api/v1/github-apps/register",
        dto
      );

      return data.gitHubApp;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey.includes("github-apps")
      });
    }
  });
};

export const useDeleteGitHubApp = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: TDeleteGitHubAppDTO) => {
      const { data } = await apiRequest.delete<{ gitHubApp: TGitHubApp }>(
        `/api/v1/github-apps/${id}`
      );

      return data.gitHubApp;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey.includes("github-apps")
      });
    }
  });
};
