import { ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import { Meter, TLicenseRegistry } from "@app/domains/platform/license/ce/module";
import { TProductAccessRegistry, TProjectsDomain } from "@app/domains/platform/projects/ce/module";

import { pamProjectAdminPermissions, pamProjectMemberPermissions } from "./service/pam-roles";

export * from "./service/pam-roles";

export type TPamDeps = {
  projectsDomain: TProjectsDomain;
  productAccessRegistry: TProductAccessRegistry;
  licenseRegistry: TLicenseRegistry;
};

// Holds only its usage counter for now; it grows as PAM moves into a domain.
export class PamModule {
  readonly name = "pam";

  constructor({ projectsDomain, productAccessRegistry, licenseRegistry }: TPamDeps) {
    // In a PAM project the project roles only decide who administers the product; what a member may do comes from
    // their folder and account memberships. So any role but admin, a custom one included, is a read-only member.
    productAccessRegistry.registerDefaultRoles({
      projectType: ProjectType.PAM,
      roles: {
        [ProjectMembershipRole.Admin]: pamProjectAdminPermissions,
        [ProjectMembershipRole.Member]: pamProjectMemberPermissions
      }
    });
    productAccessRegistry.overrideCustomRoles({
      projectType: ProjectType.PAM,
      resolve: () => pamProjectMemberPermissions
    });

    licenseRegistry.registerUsageCounter({
      meter: Meter.PamIdentities,
      count: (orgId) => projectsDomain.countProjectIdentities(ProjectType.PAM, orgId ?? undefined)
    });
  }
}
