import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { automatedSecurityKeys } from "./queries";

export const usePatchSecurityReportStatus = (orgId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await apiRequest.patch(`/api/v1/automated-security/reports/${id}/status`, {
        status
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: automatedSecurityKeys.getReports(orgId) });
    }
  });
};
