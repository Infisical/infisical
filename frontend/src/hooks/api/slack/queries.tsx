import { apiRequest } from "@app/config/request";

export const fetchSlackInstallUrl = async (workspaceId?: string) => {
  const { data } = await apiRequest.get<string>("/api/v1/slack/install", {
    params: {
      projectId: workspaceId
    }
  });

  return data;
};
