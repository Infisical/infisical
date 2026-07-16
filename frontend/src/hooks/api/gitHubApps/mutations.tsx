import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { gitHubAppKeys } from "./queries";
import { TGitHubApp } from "./types";

export const useDeleteGitHubApp = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiRequest.delete<{ gitHubApp: TGitHubApp }>(
        `/api/v1/github-apps/${id}`
      );
      return data.gitHubApp;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gitHubAppKeys.all });
    }
  });
};
