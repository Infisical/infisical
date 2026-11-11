import { ProjectType } from "@app/db/schemas";
import { Meter, TLicenseRegistry } from "@app/domains/platform/license/ce/module";
import { TProjectsDomain } from "@app/domains/platform/projects/ce/module";

export * from "./service/pam-roles";

export type TPamDeps = {
  projectsDomain: TProjectsDomain;
  licenseRegistry: TLicenseRegistry;
};

// Holds only its usage counter for now; it grows as PAM moves into a domain.
export class PamModule {
  readonly name = "pam";

  constructor({ projectsDomain, licenseRegistry }: TPamDeps) {
    licenseRegistry.registerUsageCounter({
      meter: Meter.PamIdentities,
      count: (orgId) => projectsDomain.countProjectIdentities(ProjectType.PAM, orgId ?? undefined)
    });
  }
}
