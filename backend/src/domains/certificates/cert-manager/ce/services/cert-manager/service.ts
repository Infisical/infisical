import { TOrganizationsService } from "@app/domains/platform/organizations/ce/module";

import { TCertificateUsageStore, TPkiRootOrgUsage } from "../dependencies";

export type TCertManagerService = {
  // No orgId = whole instance.
  countActiveCertificateQuota(orgId?: string): Promise<{ total: number; wildcard: number }>;
  isCertificateQuotaKeyActive(orgId: string | undefined, quotaKey: string): Promise<boolean>;
  getPkiUsageByRootOrg(): Promise<TPkiRootOrgUsage[]>;
  // Quota counts span the org tree, so their cache is keyed on the root.
  resolveRootOrgId(orgId: string): Promise<string>;
};

export class CertManagerService implements TCertManagerService {
  constructor(
    private readonly certificateUsageStore: TCertificateUsageStore,
    private readonly organizationsService: TOrganizationsService
  ) {}

  countActiveCertificateQuota(orgId?: string) {
    return this.certificateUsageStore.countActiveCertificateQuotaKeys(orgId);
  }

  isCertificateQuotaKeyActive(orgId: string | undefined, quotaKey: string) {
    return this.certificateUsageStore.isCertificateQuotaKeyActive(orgId, quotaKey);
  }

  getPkiUsageByRootOrg() {
    return this.certificateUsageStore.getPkiUsageByRootOrg();
  }

  resolveRootOrgId(orgId: string) {
    return this.organizationsService.resolveRootOrgId(orgId);
  }
}
