import { TDbClient } from "@app/db";
import { poolStoreConnection } from "@app/domains/lib/data-access";
import { Meter, TUsageCounter } from "@app/domains/platform/license/ce/module";
import { TOrganizationsService } from "@app/domains/platform/organizations/ce/module";
import { TProjectResourcePermissionService } from "@app/domains/platform/projects/ce/module";

import { CertificateUsageStore } from "./data-access/certificate-usage-store";
import { ApplicationPermissionService, TApplicationPermissionService } from "./services/application-permission/service";
import { CertManagerService, TCertManagerService } from "./services/cert-manager/service";

export * from "./models/application-resource-roles";
export * from "./models/permissions/application-roles";
export type {
  TApplicationPermissionService,
  TGetApplicationPermissionInput
} from "./services/application-permission/service";
export type { TCertManagerService } from "./services/cert-manager/service";
export type { TCertificateOrgUnitCount, TOrgUnitCount, TPkiRootOrgUsage } from "./services/dependencies";

export type TCertManagerDeps = {
  db: TDbClient;
  organizationsService: TOrganizationsService;
  projectResourcePermissionService: TProjectResourcePermissionService;
};

export class CertManagerModule {
  readonly certManagerService: TCertManagerService;

  readonly applicationPermissionService: TApplicationPermissionService;

  // These count the whole org tree, so report once at the root.
  readonly usageCounters: TUsageCounter[];

  constructor({ db, organizationsService, projectResourcePermissionService }: TCertManagerDeps) {
    const certificateUsageStore = new CertificateUsageStore(poolStoreConnection(db));
    this.certManagerService = new CertManagerService(certificateUsageStore, organizationsService);
    this.applicationPermissionService = new ApplicationPermissionService(projectResourcePermissionService);

    // Each quota key and each CA is attributed to one org, so the rows add up to the count; nothing here is a user.
    const orgRows = (rows: { orgId: string; count: number }[]) => {
      const attributed = rows.map((row) => ({ orgId: row.orgId, projectId: null, count: row.count }));
      return { total: attributed.reduce((sum, row) => sum + row.count, 0), users: 0, rows: attributed };
    };

    this.usageCounters = [
      {
        meter: Meter.InternalCas,
        count: (orgId) => certificateUsageStore.countInternalCas(orgId ?? undefined),
        breakdown: async (orgId) => orgRows(await certificateUsageStore.getInternalCaOrgBreakdown(orgId ?? undefined))
      },
      {
        meter: Meter.ActiveCerts,
        count: async (orgId) => (await certificateUsageStore.countActiveCertificateQuotaKeys(orgId ?? undefined)).total,
        breakdown: async (orgId) =>
          orgRows(await certificateUsageStore.getActiveCertificateOrgBreakdown(orgId ?? undefined))
      },
      {
        meter: Meter.WildcardCerts,
        count: async (orgId) =>
          (await certificateUsageStore.countActiveCertificateQuotaKeys(orgId ?? undefined)).wildcard,
        breakdown: async (orgId) =>
          orgRows(
            (await certificateUsageStore.getActiveCertificateOrgBreakdown(orgId ?? undefined)).map((row) => ({
              orgId: row.orgId,
              count: row.wildcard
            }))
          )
      }
    ];
  }
}
