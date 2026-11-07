import { ProjectType } from "@app/db/schemas";
import { SecretIdentities, TUsageCounter } from "@app/domains/platform/license/ce/module";
import { TOrganizationsProjectsService } from "@app/domains/platform/organizations-projects/ce/module";

// Holds only its usage counter for now; it grows as Secret Manager moves into a domain.
export class SecretsModule {
  readonly name = "secrets";

  readonly usageCounters: TUsageCounter[];

  constructor({
    organizationsProjects
  }: {
    organizationsProjects: Pick<TOrganizationsProjectsService, "countProjectIdentities">;
  }) {
    this.usageCounters = [
      {
        feature: SecretIdentities,
        scope: "org",
        count: (orgId) => organizationsProjects.countProjectIdentities(ProjectType.SecretManager, orgId ?? undefined)
      }
    ];
  }
}
