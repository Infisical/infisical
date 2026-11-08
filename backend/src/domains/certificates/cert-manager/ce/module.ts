import { DataAccessDb } from "@app/domains/lib/data-access-db";
import { Meter, TLicenseRegistry } from "@app/domains/platform/license/ce/module";
import { TOrganizationsProjectsDomain } from "@app/domains/platform/organizations-projects/ce/module";

import {
  CertificateUsageDataAccess,
  TCertificateOrgUnitRow,
  TOrgUnitCountRow,
  TPkiRootOrgUsageRow
} from "./data-access/usage-counter-data-access";

export type { TCertificateOrgUnitRow, TOrgUnitCountRow, TPkiRootOrgUsageRow };

export type TCertManagerDomain = {
  // Distinct certificate names in use, and how many of them are wildcards. orgId omitted counts the
  // whole instance.
  countActiveCertificateQuota: (orgId?: string) => Promise<{ total: number; wildcard: number }>;
  isCertificateQuotaKeyActive: (orgId: string | undefined, quotaKey: string) => Promise<boolean>;
  getInternalCaOrgBreakdown: (orgId?: string) => Promise<TOrgUnitCountRow[]>;
  getActiveCertificateOrgBreakdown: (orgId?: string) => Promise<TCertificateOrgUnitRow[]>;
  getPkiUsageByRootOrg: () => Promise<TPkiRootOrgUsageRow[]>;
  // Quota counts span the org tree, so their cache is keyed on the root.
  resolveRootOrgId: (orgId: string) => Promise<string>;
};

export type TCertManagerDeps = {
  db: DataAccessDb;
  organizationsProjectsDomain: TOrganizationsProjectsDomain;
  licenseRegistry: TLicenseRegistry;
};

// Holds only the PKI usage counters and quota reads for now; it grows as certificate management moves in.
export class CertManagerModule {
  readonly name = "cert-manager";

  readonly service: TCertManagerDomain;

  constructor({ db, organizationsProjectsDomain, licenseRegistry }: TCertManagerDeps) {
    const usage = new CertificateUsageDataAccess(db);
    this.service = {
      countActiveCertificateQuota: (orgId) => usage.countActiveCertificateQuotaKeys(orgId),
      isCertificateQuotaKeyActive: (orgId, quotaKey) => usage.isCertificateQuotaKeyActive(orgId, quotaKey),
      getInternalCaOrgBreakdown: (orgId) => usage.getInternalCaOrgBreakdown(orgId),
      getActiveCertificateOrgBreakdown: (orgId) => usage.getActiveCertificateOrgBreakdown(orgId),
      getPkiUsageByRootOrg: () => usage.getPkiUsageByRootOrg(),
      resolveRootOrgId: (orgId) => organizationsProjectsDomain.resolveRootOrgId(orgId)
    };

    // Each counts the whole org tree, so it is reported once, at the root.
    licenseRegistry.registerUsageCounter({
      meter: Meter.InternalCas,
      count: (orgId) => usage.countInternalCas(orgId ?? undefined)
    });
    licenseRegistry.registerUsageCounter({
      meter: Meter.ActiveCerts,
      count: async (orgId) => (await usage.countActiveCertificateQuotaKeys(orgId ?? undefined)).total
    });
    licenseRegistry.registerUsageCounter({
      meter: Meter.WildcardCerts,
      count: async (orgId) => (await usage.countActiveCertificateQuotaKeys(orgId ?? undefined)).wildcard
    });
  }
}
