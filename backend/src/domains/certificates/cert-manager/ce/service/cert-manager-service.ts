import { TOrganizationsProjectsService } from "@app/domains/platform/organizations-projects/ce/module";

import { TCertificateOrgUnitCount, TCertificateUsageDataAccess, TOrgUnitCount, TPkiRootOrgUsage } from "./dependencies";

export type TCertManagerService = {
  // No orgId = whole instance.
  countActiveCertificateQuota(orgId?: string): Promise<{ total: number; wildcard: number }>;
  isCertificateQuotaKeyActive(orgId: string | undefined, quotaKey: string): Promise<boolean>;
  getInternalCaOrgBreakdown(orgId?: string): Promise<TOrgUnitCount[]>;
  getActiveCertificateOrgBreakdown(orgId?: string): Promise<TCertificateOrgUnitCount[]>;
  getPkiUsageByRootOrg(): Promise<TPkiRootOrgUsage[]>;
  // Quota counts span the org tree, so their cache is keyed on the root.
  resolveRootOrgId(orgId: string): Promise<string>;
};

export type TCertManagerServiceDeps = {
  certificateUsage: TCertificateUsageDataAccess;
  organizationsProjectsService: TOrganizationsProjectsService;
};

export class CertManagerService implements TCertManagerService {
  constructor(private readonly deps: TCertManagerServiceDeps) {}

  countActiveCertificateQuota(orgId?: string) {
    return this.deps.certificateUsage.countActiveCertificateQuotaKeys(orgId);
  }

  isCertificateQuotaKeyActive(orgId: string | undefined, quotaKey: string) {
    return this.deps.certificateUsage.isCertificateQuotaKeyActive(orgId, quotaKey);
  }

  getInternalCaOrgBreakdown(orgId?: string) {
    return this.deps.certificateUsage.getInternalCaOrgBreakdown(orgId);
  }

  getActiveCertificateOrgBreakdown(orgId?: string) {
    return this.deps.certificateUsage.getActiveCertificateOrgBreakdown(orgId);
  }

  getPkiUsageByRootOrg() {
    return this.deps.certificateUsage.getPkiUsageByRootOrg();
  }

  resolveRootOrgId(orgId: string) {
    return this.deps.organizationsProjectsService.resolveRootOrgId(orgId);
  }
}
