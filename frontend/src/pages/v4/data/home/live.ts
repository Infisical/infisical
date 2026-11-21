import { useGetServerConfig } from "@app/hooks/api/admin/queries";
import { useGetOrgProductStats } from "@app/hooks/api/organization/queries";
import { ProjectType } from "@app/hooks/api/projects/types";
import { useGetOrgSecretsAccessVolume } from "@app/hooks/api/secretInsights/queries";
import { useGetOrgUserAccess } from "@app/hooks/api/users/queries";

import { useV4Session } from "../session/contract";
import type { HomeAdapter } from "./contract";

export const homeLive: HomeAdapter = {
  useSecretReads: (orgId, enabled = true) => {
    const analytics = Boolean(useGetServerConfig().data?.isClickhouseAuditLogEnabled);
    const query = useGetOrgSecretsAccessVolume(orgId, { enabled: analytics && enabled });
    if (!analytics) return { data: null, isPending: false, error: null };
    return {
      data: query.data && {
        total: query.data.days.reduce((sum, day) => sum + day.total, 0),
        days: query.data.days.map((day) => ({
          date: day.date,
          value: day.total
        }))
      },
      isPending: query.isPending,
      error: query.error
    };
  },
  useSetup: (orgId, enabled = true) => {
    const { projects } = useV4Session();
    const stats = useGetOrgProductStats(orgId, { enabled, staleTime: 0 });
    const reads = homeLive.useSecretReads(orgId, enabled);
    const members = useGetOrgUserAccess(orgId, { enabled });
    return {
      data:
        stats.data && members.data && !reads.isPending
          ? {
              hasProject: projects.some((project) => project.type === ProjectType.SecretManager),
              hasSecrets: stats.data.secretManager.secretsCount > 0,
              hasReads: reads.data == null ? null : reads.data.total > 0,
              members: members.data.length
            }
          : undefined,
      isPending: stats.isPending || members.isPending || reads.isPending,
      error: stats.error ?? members.error
    };
  }
};
