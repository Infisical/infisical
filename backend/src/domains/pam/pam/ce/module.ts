import { ProjectType } from "@app/db/schemas";
import { Meter, TUsageCounter } from "@app/domains/platform/license/ce/module";
import { TProjectsService } from "@app/domains/platform/projects/ce/module";

export type TPamDeps = {
  projectsService: TProjectsService;
};

export class PamModule {
  readonly usageCounters: TUsageCounter[];

  constructor({ projectsService }: TPamDeps) {
    this.usageCounters = [
      {
        meter: Meter.PamIdentities,
        count: (orgId) => projectsService.countProjectIdentities(ProjectType.PAM, orgId)
      }
    ];
  }
}
