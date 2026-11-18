import { ProjectType } from "@app/db/schemas";
import { Meter, TUsageCounter } from "@app/domains/platform/license/ce/module";
import { TProjectsService } from "@app/domains/platform/projects/ce/module";

export type TSecretsDeps = {
  projectsService: TProjectsService;
};

export class SecretsModule {
  readonly usageCounters: TUsageCounter[];

  constructor({ projectsService }: TSecretsDeps) {
    this.usageCounters = [
      {
        meter: Meter.SecretIdentities,
        count: (orgId) => projectsService.countProjectIdentities(ProjectType.SecretManager, orgId)
      }
    ];
  }
}
