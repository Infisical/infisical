import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TWebhook } from "./types";

export const queryKeys = {
  getWebhooks: (workspaceId: string) => ["webhooks", { workspaceId }]
};

const fetchWebhooks = async (workspaceId: string) => {
  const { data } = await apiRequest.get<{ webhooks: TWebhook[] }>("/api/v1/webhooks", {
    params: {
      workspaceId
    }
  });

  return data.webhooks;
};

export const useGetWebhooks = (workspaceId: string) =>
  useQuery({
    queryKey: queryKeys.getWebhooks(workspaceId),
    queryFn: () => fetchWebhooks(workspaceId),
    enabled: Boolean(workspaceId)
  });
