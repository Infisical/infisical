import { ProjectType } from "@app/db/schemas";
import { SecretIdentities, TLicenseRegistry } from "@app/domains/platform/license/ce/module";
import { TOrganizationsProjectsDomain } from "@app/domains/platform/organizations-projects/ce/module";

export type TSecretsDeps = {
  organizationsProjects: TOrganizationsProjectsDomain;
  license: TLicenseRegistry;
};

// Holds only its usage counter for now; it grows as Secret Manager moves into a domain.
export class SecretsModule {
  readonly name = "secrets";

  constructor({ organizationsProjects, license }: TSecretsDeps) {
    license.registerUsageCounter({
      feature: SecretIdentities,
      scope: "org",
      count: (orgId) => organizationsProjects.countProjectIdentities(ProjectType.SecretManager, orgId ?? undefined)
    });
  }
}
