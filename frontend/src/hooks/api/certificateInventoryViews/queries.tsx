import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TListInventoryViewsResponse } from "./types";

export const certificateInventoryViewKeys = {
  all: ["certificateInventoryViews"] as const,
  list: (projectId: string) => [...certificateInventoryViewKeys.all, { projectId }] as const
};

export const useListCertificateInventoryViews = (projectId: string) => {
  return useQuery({
    queryKey: certificateInventoryViewKeys.list(projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListInventoryViewsResponse>(
        `/api/v1/projects/${projectId}/certificate-inventory-views`
      );
      return data;
    },
    enabled: Boolean(projectId)
  });
};
