import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TWebhook } from "./types";

export const queryKeys = {
  getWebhooks: (workspaceId: string) => ["webhooks", { workspaceId }]
};

const fetchWebhooks = async (projectId: string) => {
  const { data } = await apiRequest.get<{ webhooks: TWebhook[] }>("/api/v1/webhooks", {
    params: {
      projectId
    }
  });

  return data.webhooks;
};

export const useGetWebhooks = (projectId: string) =>
  useQuery({
    queryKey: queryKeys.getWebhooks(projectId),
    queryFn: () => fetchWebhooks(projectId),
    enabled: Boolean(projectId)
  });
