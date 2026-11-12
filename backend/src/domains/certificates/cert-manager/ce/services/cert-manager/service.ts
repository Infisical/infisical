import { TOrganizationsProjectsService } from "@app/domains/platform/organizations-projects/ce/module";

import {
  TCertificateOrgUnitCount,
  TCertificateUsageDataAccess,
  TOrgUnitCount,
  TPkiRootOrgUsage
} from "../dependencies";

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

export class CertManagerService implements TCertManagerService {
  constructor(
    private readonly certificateUsageDataAccess: TCertificateUsageDataAccess,
    private readonly organizationsProjectsService: TOrganizationsProjectsService
  ) {}

  countActiveCertificateQuota(orgId?: string) {
    return this.certificateUsageDataAccess.countActiveCertificateQuotaKeys(orgId);
  }

  isCertificateQuotaKeyActive(orgId: string | undefined, quotaKey: string) {
    return this.certificateUsageDataAccess.isCertificateQuotaKeyActive(orgId, quotaKey);
  }

  getInternalCaOrgBreakdown(orgId?: string) {
    return this.certificateUsageDataAccess.getInternalCaOrgBreakdown(orgId);
  }

  getActiveCertificateOrgBreakdown(orgId?: string) {
    return this.certificateUsageDataAccess.getActiveCertificateOrgBreakdown(orgId);
  }

  getPkiUsageByRootOrg() {
    return this.certificateUsageDataAccess.getPkiUsageByRootOrg();
  }

  resolveRootOrgId(orgId: string) {
    return this.organizationsProjectsService.resolveRootOrgId(orgId);
  }
}
