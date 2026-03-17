import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TCertificateCleanupConfig } from "./types";

export const certificateCleanupKeys = {
  getConfig: (projectId: string) => [{ projectId }, "certificate-cleanup-config"] as const
};

export const useGetCertificateCleanupConfig = (projectId: string) => {
  return useQuery({
    queryKey: certificateCleanupKeys.getConfig(projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ config: TCertificateCleanupConfig | null }>(
        "/api/v1/cert-manager/certificate-cleanup",
        { params: { projectId } }
      );
      return data.config;
    },
    enabled: Boolean(projectId)
  });
};
