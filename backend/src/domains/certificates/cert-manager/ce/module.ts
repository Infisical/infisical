import { TDbClient } from "@app/db";
import { Meter, TUsageCounter } from "@app/domains/platform/license/ce/module";
import { TOrganizationsProjectsService } from "@app/domains/platform/organizations-projects/ce/module";

import { CertificateUsageStore } from "./data-access/certificate-usage-store";
import { CertManagerService, TCertManagerService } from "./services/cert-manager/service";

export type { TCertManagerService } from "./services/cert-manager/service";
export type { TCertificateOrgUnitCount, TOrgUnitCount, TPkiRootOrgUsage } from "./services/dependencies";

export type TCertManagerDeps = {
  db: TDbClient;
  organizationsProjectsService: TOrganizationsProjectsService;
};

export class CertManagerModule {
  readonly certManagerService: TCertManagerService;

  // These count the whole org tree, so report once at the root.
  readonly usageCounters: TUsageCounter[];

  constructor({ db, organizationsProjectsService }: TCertManagerDeps) {
    const certificateUsageStore = new CertificateUsageStore(db);
    this.certManagerService = new CertManagerService(certificateUsageStore, organizationsProjectsService);

    this.usageCounters = [
      { meter: Meter.InternalCas, count: (orgId) => certificateUsageStore.countInternalCas(orgId ?? undefined) },
      {
        meter: Meter.ActiveCerts,
        count: async (orgId) => (await certificateUsageStore.countActiveCertificateQuotaKeys(orgId ?? undefined)).total
      },
      {
        meter: Meter.WildcardCerts,
        count: async (orgId) =>
          (await certificateUsageStore.countActiveCertificateQuotaKeys(orgId ?? undefined)).wildcard
      }
    ];
  }
}
