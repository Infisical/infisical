import { ProjectType } from "@app/db/schemas";
import { SecretIdentities, TLicenseRegistry } from "@app/domains/platform/license/ce/module";
import { TOrganizationsProjectsDomain } from "@app/domains/platform/organizations-projects/ce/module";

export type TSecretsDeps = {
  organizationsProjectsDomain: TOrganizationsProjectsDomain;
  licenseRegistry: TLicenseRegistry;
};

// Holds only its usage counter for now; it grows as Secret Manager moves into a domain.
export class SecretsModule {
  readonly name = "secrets";

  constructor({ organizationsProjectsDomain, licenseRegistry }: TSecretsDeps) {
    licenseRegistry.registerUsageCounter({
      feature: SecretIdentities,
      scope: "org",
      count: (orgId) =>
        organizationsProjectsDomain.countProjectIdentities(ProjectType.SecretManager, orgId ?? undefined)
    });
  }
}
