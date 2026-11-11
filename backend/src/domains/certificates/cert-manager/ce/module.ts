import { DataAccessDb } from "@app/domains/lib/data-access-db";
import { Meter, TUsageCounter } from "@app/domains/platform/license/ce/module";
import { TOrganizationsProjectsService } from "@app/domains/platform/organizations-projects/ce/module";

import { CertificateUsageDataAccess } from "./data-access/usage-counter-data-access";
import { CertManagerService, TCertManagerService } from "./service/cert-manager-service";

export type { TCertManagerService } from "./service/cert-manager-service";
export type { TCertificateOrgUnitCount, TOrgUnitCount, TPkiRootOrgUsage } from "./service/dependencies";

export type TCertManagerDeps = {
  db: DataAccessDb;
  organizationsProjectsService: TOrganizationsProjectsService;
};

export class CertManagerModule {
  readonly service: TCertManagerService;

  readonly usageCounters: TUsageCounter[];

  constructor({ db, organizationsProjectsService }: TCertManagerDeps) {
    const certificateUsage = new CertificateUsageDataAccess(db);
    this.service = new CertManagerService({ certificateUsage, organizationsProjectsService });

    // These count the whole org tree, so report once at the root.
    this.usageCounters = [
      { meter: Meter.InternalCas, count: (orgId) => certificateUsage.countInternalCas(orgId ?? undefined) },
      {
        meter: Meter.ActiveCerts,
        count: async (orgId) => {
          const counts = await certificateUsage.countActiveCertificateQuotaKeys(orgId ?? undefined);
          return counts.total;
        }
      },
      {
        meter: Meter.WildcardCerts,
        count: async (orgId) => {
          const counts = await certificateUsage.countActiveCertificateQuotaKeys(orgId ?? undefined);
          return counts.wildcard;
        }
      }
    ];
  }
}
