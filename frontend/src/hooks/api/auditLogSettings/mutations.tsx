import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { auditLogSettingsKeys } from "./queries";
import {
  TOrgAuditLogSettings,
  TProjectAuditLogSettings,
  TUpdateOrgAuditLogSettingsDTO,
  TUpdateProjectAuditLogSettingsDTO
} from "./types";

export const useUpdateOrgAuditLogSettings = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: TUpdateOrgAuditLogSettingsDTO) => {
      const { data } = await apiRequest.put<{ auditLogSettings: TOrgAuditLogSettings }>(
        "/api/v1/organization/audit-log-settings",
        dto
      );
      return data.auditLogSettings;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(auditLogSettingsKeys.org(orgId), data);
      // Project settings inherit from the org, so they may have changed too.
      queryClient.invalidateQueries({ queryKey: auditLogSettingsKeys.all });
    }
  });
};

export const useUpdateProjectAuditLogSettings = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, ...dto }: TUpdateProjectAuditLogSettingsDTO) => {
      const { data } = await apiRequest.put<{ auditLogSettings: TProjectAuditLogSettings }>(
        `/api/v1/projects/${projectId}/audit-log-settings`,
        dto
      );
      return data.auditLogSettings;
    },
    onSuccess: (data, { projectId }) => {
      queryClient.setQueryData(auditLogSettingsKeys.project(projectId), data);
    }
  });
};
