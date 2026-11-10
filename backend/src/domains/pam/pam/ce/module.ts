import { ProjectType } from "@app/db/schemas";
import { Meter, TUsageCounter } from "@app/domains/platform/license/ce/module";
import { TOrganizationsProjectsService } from "@app/domains/platform/organizations-projects/ce/module";

export type TPamDeps = {
  organizationsProjectsService: TOrganizationsProjectsService;
};

// Holds only its usage counter for now; it grows as PAM moves into a domain.
export class PamModule {
  readonly usageCounters: TUsageCounter[];

  constructor({ organizationsProjectsService }: TPamDeps) {
    this.usageCounters = [
      {
        meter: Meter.PamIdentities,
        count: (orgId) => organizationsProjectsService.countProjectIdentities(ProjectType.PAM, orgId ?? undefined)
      }
    ];
  }
}
