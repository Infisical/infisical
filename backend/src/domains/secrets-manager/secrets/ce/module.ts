import { ProjectType } from "@app/db/schemas";
import { Meter, TUsageCounter } from "@app/domains/platform/license/ce/module";
import { TOrganizationsProjectsService } from "@app/domains/platform/organizations-projects/ce/module";

export type TSecretsDeps = {
  organizationsProjectsService: TOrganizationsProjectsService;
};

export class SecretsModule {
  readonly usageCounters: TUsageCounter[];

  constructor({ organizationsProjectsService }: TSecretsDeps) {
    this.usageCounters = [
      {
        meter: Meter.SecretIdentities,
        count: (orgId) =>
          organizationsProjectsService.countProjectIdentities(ProjectType.SecretManager, orgId ?? undefined)
      }
    ];
  }
}
