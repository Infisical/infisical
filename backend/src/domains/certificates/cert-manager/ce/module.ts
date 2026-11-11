import type { TActorContext } from "@app/domains/lib/actor-context";
import { DataAccessDb } from "@app/domains/lib/data-access-db";
import { Meter, TLicenseRegistry } from "@app/domains/platform/license/ce/module";
import { TOrganizationsDomain } from "@app/domains/platform/organizations/ce/module";
import { ProjectResourcePermission, TProjectsDomain } from "@app/domains/platform/projects/ce/module";

import {
  CertificateUsageDataAccess,
  TCertificateOrgUnitRow,
  TOrgUnitCountRow,
  TPkiRootOrgUsageRow
} from "./data-access/usage-counter-data-access";
import { getApplicationPermission } from "./service/application-permission";
import { ApplicationPermissionSet } from "./service/application-roles";

export { applicationRoles } from "./service/application-permission";

export * from "./service/application-roles";

export type { TCertificateOrgUnitRow, TOrgUnitCountRow, TPkiRootOrgUsageRow };

export type TCertManagerDomain = {
  // What the actor may do on one certificate application: its application role, with the project-admin fallback.
  getApplicationPermission: (input: {
    actor: TActorContext;
    projectId: string;
    applicationId: string;
  }) => Promise<ProjectResourcePermission<ApplicationPermissionSet>>;
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
  organizationsDomain: TOrganizationsDomain;
  projectsDomain: TProjectsDomain;
  licenseRegistry: TLicenseRegistry;
};

// Holds only the PKI usage counters and quota reads for now; it grows as certificate management moves in.
export class CertManagerModule {
  readonly name = "cert-manager";

  readonly service: TCertManagerDomain;

  constructor({ db, organizationsDomain, projectsDomain, licenseRegistry }: TCertManagerDeps) {
    const usage = new CertificateUsageDataAccess(db);
    this.service = {
      getApplicationPermission: (input) => getApplicationPermission(projectsDomain, input),
      countActiveCertificateQuota: (orgId) => usage.countActiveCertificateQuotaKeys(orgId),
      isCertificateQuotaKeyActive: (orgId, quotaKey) => usage.isCertificateQuotaKeyActive(orgId, quotaKey),
      getInternalCaOrgBreakdown: (orgId) => usage.getInternalCaOrgBreakdown(orgId),
      getActiveCertificateOrgBreakdown: (orgId) => usage.getActiveCertificateOrgBreakdown(orgId),
      getPkiUsageByRootOrg: () => usage.getPkiUsageByRootOrg(),
      resolveRootOrgId: (orgId) => organizationsDomain.resolveRootOrgId(orgId)
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
