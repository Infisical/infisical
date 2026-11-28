import { Meter, TUsageBreakdown, TUsageCounter } from "@app/domains/platform/license/ce/module";

import { TCertificateUsageStore, TOrgUnitCount } from "../dependencies";

// Each quota key and each CA is attributed to exactly one org, so the rows add up to the count. Nothing here is a
// user, and nothing is held by a project.
const orgUnitBreakdown = (rows: TOrgUnitCount[]): TUsageBreakdown => {
  const attributed = rows.map((row) => ({ orgId: row.orgId, projectId: null, count: row.count }));
  const total = attributed.reduce((sum, row) => sum + row.count, 0);
  return { total, users: 0, rows: attributed };
};

// A null orgId counts the whole instance.
export const certificateUsageCounters = (certificateUsageStore: TCertificateUsageStore): TUsageCounter[] => [
  {
    meter: Meter.InternalCas,
    count: (orgId) => certificateUsageStore.countInternalCas(orgId ?? undefined),
    breakdown: async (orgId) => {
      const rows = await certificateUsageStore.getInternalCaOrgBreakdown(orgId ?? undefined);
      return orgUnitBreakdown(rows);
    }
  },
  {
    meter: Meter.ActiveCerts,
    count: async (orgId) => {
      const quota = await certificateUsageStore.countActiveCertificateQuotaKeys(orgId ?? undefined);
      return quota.total;
    },
    breakdown: async (orgId) => {
      const rows = await certificateUsageStore.getActiveCertificateOrgBreakdown(orgId ?? undefined);
      return orgUnitBreakdown(rows);
    }
  },
  {
    meter: Meter.WildcardCerts,
    count: async (orgId) => {
      const quota = await certificateUsageStore.countActiveCertificateQuotaKeys(orgId ?? undefined);
      return quota.wildcard;
    },
    breakdown: async (orgId) => {
      const rows = await certificateUsageStore.getActiveCertificateOrgBreakdown(orgId ?? undefined);
      const wildcardRows = rows.map((row) => ({ orgId: row.orgId, count: row.wildcard }));
      return orgUnitBreakdown(wildcardRows);
    }
  }
];
