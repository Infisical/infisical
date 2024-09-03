import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { ProjectSlackIntegration } from "./types";

export const slackKeys = {
  getSlackIntegrationByProject: (workspaceId?: string) => [
    { workspaceId },
    "slack-integration-by-project"
  ]
};

export const fetchSlackIntegrationByProject = async (workspaceId?: string) => {
  const { data } = await apiRequest.get<ProjectSlackIntegration>("/api/v1/slack", {
    params: {
      projectId: workspaceId
    }
  });

  return data;
};

export const useGetSlackIntegrationByProject = (workspaceId?: string) =>
  useQuery({
    queryKey: slackKeys.getSlackIntegrationByProject(workspaceId),
    queryFn: () => fetchSlackIntegrationByProject(workspaceId),
    enabled: Boolean(workspaceId)
  });
