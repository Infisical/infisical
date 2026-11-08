import { ProjectType } from "@app/db/schemas";
import { PamIdentities, TLicenseRegistry } from "@app/domains/platform/license/ce/module";
import { TOrganizationsProjectsDomain } from "@app/domains/platform/organizations-projects/ce/module";

export type TPamDeps = {
  organizationsProjects: TOrganizationsProjectsDomain;
  license: TLicenseRegistry;
};

// Holds only its usage counter for now; it grows as PAM moves into a domain.
export class PamModule {
  readonly name = "pam";

  constructor({ organizationsProjects, license }: TPamDeps) {
    license.registerUsageCounter({
      feature: PamIdentities,
      scope: "org",
      count: (orgId) => organizationsProjects.countProjectIdentities(ProjectType.PAM, orgId ?? undefined)
    });
  }
}
