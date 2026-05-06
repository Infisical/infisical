import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TListInventoryViewsResponse } from "./types";

export const certificateInventoryViewKeys = {
  all: ["certificateInventoryViews"] as const,
  list: (applicationId?: string) =>
    [...certificateInventoryViewKeys.all, "list", { applicationId: applicationId ?? null }] as const
};

export const useListCertificateInventoryViews = (applicationId?: string) => {
  return useQuery({
    queryKey: certificateInventoryViewKeys.list(applicationId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListInventoryViewsResponse>(
        "/api/v1/cert-manager/certificate-inventory-views",
        { params: applicationId ? { applicationId } : undefined }
      );
      return data;
    }
  });
};
