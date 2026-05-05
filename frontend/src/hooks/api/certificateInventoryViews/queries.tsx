import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TListInventoryViewsResponse } from "./types";

export const certificateInventoryViewKeys = {
  all: ["certificateInventoryViews"] as const,
  list: () => [...certificateInventoryViewKeys.all, "list"] as const
};

export const useListCertificateInventoryViews = () => {
  return useQuery({
    queryKey: certificateInventoryViewKeys.list(),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListInventoryViewsResponse>(
        "/api/v1/cert-manager/certificate-inventory-views"
      );
      return data;
    }
  });
};
