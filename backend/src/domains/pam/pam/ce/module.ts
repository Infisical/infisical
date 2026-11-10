import { ProjectType } from "@app/db/schemas";
import { Meter, TLicenseRegistry } from "@app/domains/platform/license/ce/module";
import { TOrganizationsProjectsDomain } from "@app/domains/platform/organizations-projects/ce/module";

export * from "./service/pam-roles";

export type TPamDeps = {
  organizationsProjectsDomain: TOrganizationsProjectsDomain;
  licenseRegistry: TLicenseRegistry;
};

// Holds only its usage counter for now; it grows as PAM moves into a domain.
export class PamModule {
  readonly name = "pam";

  constructor({ organizationsProjectsDomain, licenseRegistry }: TPamDeps) {
    licenseRegistry.registerUsageCounter({
      meter: Meter.PamIdentities,
      count: (orgId) => organizationsProjectsDomain.countProjectIdentities(ProjectType.PAM, orgId ?? undefined)
    });
  }
}
