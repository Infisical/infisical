import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { certificateCleanupKeys } from "./queries";
import { TCertificateCleanupConfig, TUpdateCertificateCleanupConfigDTO } from "./types";

export const useUpdateCertificateCleanupConfig = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: TUpdateCertificateCleanupConfigDTO) => {
      const { data } = await apiRequest.put<{ config: TCertificateCleanupConfig }>(
        "/api/v1/cert-manager/certificate-cleanup",
        dto
      );
      return data.config;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: certificateCleanupKeys.getConfig(variables.projectId)
      });
    }
  });
};
