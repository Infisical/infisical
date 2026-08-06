import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { auditReportKeys } from "./queries";
import { TAuditReport, TDeleteAuditReportDTO, TRequestAuditReportDTO } from "./types";

export const useRequestAuditReport = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, ...body }: TRequestAuditReportDTO) => {
      const { data } = await apiRequest.post<TAuditReport>(
        `/api/v1/insights/${projectId}/secrets/reports`,
        body
      );
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: auditReportKeys.all() })
  });
};

export const useDeleteAuditReport = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, auditReportId }: TDeleteAuditReportDTO) => {
      const { data } = await apiRequest.delete<TAuditReport>(
        `/api/v1/insights/${projectId}/secrets/reports/${auditReportId}`
      );
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: auditReportKeys.all() })
  });
};
