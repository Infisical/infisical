import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TCertificateCleanupConfig } from "./types";

export const certificateCleanupKeys = {
  getConfig: () => ["certificate-cleanup-config"] as const
};

export const useGetCertificateCleanupConfig = () => {
  return useQuery({
    queryKey: certificateCleanupKeys.getConfig(),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ config: TCertificateCleanupConfig | null }>(
        "/api/v1/cert-manager/certificate-cleanup"
      );
      return data.config;
    }
  });
};
