import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { auditReportKeys } from "./queries";
import { TAuditReport, TRequestAuditReportDTO } from "./types";

export const useRequestAuditReport = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: TRequestAuditReportDTO) => {
      const { data } = await apiRequest.post<TAuditReport>("/api/v1/audit-reports", dto);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: auditReportKeys.all() })
  });
};

export const useDeleteAuditReport = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (auditReportId: string) => {
      const { data } = await apiRequest.delete<TAuditReport>(
        `/api/v1/audit-reports/${auditReportId}`
      );
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: auditReportKeys.all() })
  });
};
