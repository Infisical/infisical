import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TAuditLogSettings } from "./types";

export const auditLogSettingsKeys = {
  all: ["audit-log-settings"] as const,
  org: (orgId: string) => [...auditLogSettingsKeys.all, "org", orgId] as const,
  project: (projectId: string) => [...auditLogSettingsKeys.all, "project", projectId] as const
};

export const useGetOrgAuditLogSettings = (orgId: string) => {
  return useQuery({
    queryKey: auditLogSettingsKeys.org(orgId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ auditLogSettings: TAuditLogSettings }>(
        "/api/v1/organization/audit-log-settings"
      );
      return data.auditLogSettings;
    },
    enabled: Boolean(orgId)
  });
};

export const useGetProjectAuditLogSettings = (projectId: string) => {
  return useQuery({
    queryKey: auditLogSettingsKeys.project(projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ auditLogSettings: TAuditLogSettings }>(
        `/api/v1/projects/${projectId}/audit-log-settings`
      );
      return data.auditLogSettings;
    },
    enabled: Boolean(projectId)
  });
};
