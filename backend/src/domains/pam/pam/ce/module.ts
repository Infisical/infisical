import { ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { Meter, TLicenseRegistry } from "@app/domains/platform/license/ce/module";
import {
  ProjectResourcePermission,
  TProductAccessRegistry,
  TProjectsDomain
} from "@app/domains/platform/projects/ce/module";

import { getPamPermission } from "./service/pam-permission";
import { pamProjectAdminPermissions, pamProjectMemberPermissions, PamResourcePermissionSet } from "./service/pam-roles";

export { pamResourceRoles } from "./service/pam-permission";

export * from "./service/pam-roles";

export type TPamDomain = {
  // What the actor may do on a PAM folder, an account, or an account in a folder. isProjectAdmin on the result is
  // the product admin.
  getPamPermission: (input: {
    actor: TActorContext;
    projectId: string;
    folderId?: string | null;
    accountId?: string;
  }) => Promise<ProjectResourcePermission<PamResourcePermissionSet>>;
};

export type TPamDeps = {
  projectsDomain: TProjectsDomain;
  productAccessRegistry: TProductAccessRegistry;
  licenseRegistry: TLicenseRegistry;
};

// Holds only its usage counter for now; it grows as PAM moves into a domain.
export class PamModule {
  readonly name = "pam";

  readonly service: TPamDomain;

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

    this.service = { getPamPermission: (input) => getPamPermission(projectsDomain, input) };

    licenseRegistry.registerUsageCounter({
      meter: Meter.PamIdentities,
      count: (orgId) => projectsDomain.countProjectIdentities(ProjectType.PAM, orgId ?? undefined)
    });
  }
}
