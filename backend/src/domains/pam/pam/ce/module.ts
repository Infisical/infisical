import { ProjectType } from "@app/db/schemas";
import { PamIdentities, TUsageCounter } from "@app/domains/platform/license/ce/module";
import { TOrganizationsProjectsService } from "@app/domains/platform/organizations-projects/ce/module";

// Holds only its usage counter for now; it grows as PAM moves into a domain.
export class PamModule {
  readonly name = "pam";

  readonly usageCounters: TUsageCounter[];

  constructor({
    organizationsProjects
  }: {
    organizationsProjects: Pick<TOrganizationsProjectsService, "countProjectIdentities">;
  }) {
    this.usageCounters = [
      {
        feature: PamIdentities,
        scope: "org",
        count: (orgId) => organizationsProjects.countProjectIdentities(ProjectType.PAM, orgId ?? undefined)
      }
    ];
  }
}
