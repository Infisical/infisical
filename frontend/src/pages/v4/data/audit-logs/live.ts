import { useQuery, useQueryClient } from "@tanstack/react-query";

import { isInfisicalCloud } from "@app/helpers/platform";
import { useGetAuditLogPostgresStorageStatus } from "@app/hooks/api/auditLogs/queries";
import { useUpdateProjectAuditLogSettings } from "@app/hooks/api/auditLogSettings/mutations";
import { useGetProjectAuditLogSettings } from "@app/hooks/api/auditLogSettings/queries";
import { organizationKeys, useGetOrganizationById } from "@app/hooks/api/organization/queries";
import type { Organization } from "@app/hooks/api/organization/types";
import { fetchPamProjectId } from "@app/hooks/api/pam/queries";
import { useUpdateWorkspaceAuditLogsRetention } from "@app/hooks/api/projects/queries";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails/queries";
import { useGetOrgSubscription } from "@app/hooks/api/subscriptions/queries";

import type { AuditLogsAdapter } from "./contract";

const VOLUME_WARNING_ROWS = 350_000_000;

export const auditLogsLive: AuditLogsAdapter = {
  usePlan: (orgId) => {
    const { data, isPending, error } = useGetOrgSubscription({ orgID: orgId });
    return {
      data: data
        ? { auditLogs: data.auditLogs, auditLogsRetentionDays: data.auditLogsRetentionDays }
        : undefined,
      isPending,
      error
    };
  },
  useStorage: () => {
    const server = useFetchServerStatus();
    const postgres = useGetAuditLogPostgresStorageStatus();
    const status = postgres.data;
    return {
      data: server.data
        ? {
            storageDisabled: server.data.auditLogStorageDisabled,
            volumeWarning: Boolean(
              !isInfisicalCloud() &&
              status &&
              !status.clickHouseConfigured &&
              !status.auditLogStorageDisabled &&
              !status.auditLogGenerationDisabled &&
              status.auditLogRowCount >= VOLUME_WARNING_ROWS
            )
          }
        : undefined,
      isPending: server.isPending,
      error: server.error
    };
  },
  usePamProjectId: (orgId) => {
    const queryClient = useQueryClient();
    const organization = useGetOrganizationById(orgId);
    const known = organization.data?.pamProjectId;
    const bootstrap = useQuery({
      queryKey: [...organizationKeys.getOrgById(orgId), "pam-project-id"],
      queryFn: async () => {
        const projectId = await fetchPamProjectId();
        queryClient.setQueryData<Organization>(organizationKeys.getOrgById(orgId), (old) =>
          old ? { ...old, pamProjectId: projectId } : old
        );
        return projectId;
      },
      enabled: Boolean(organization.data) && !known
    });
    return {
      data: known ?? bootstrap.data,
      isPending: organization.isPending || (!known && bootstrap.isPending),
      error: organization.error ?? bootstrap.error
    };
  },
  useProjectSettings: useGetProjectAuditLogSettings,
  useUpdateProjectSettings: useUpdateProjectAuditLogSettings,
  useUpdateProjectRetention: useUpdateWorkspaceAuditLogsRetention
};
