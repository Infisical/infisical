import { ProjectType } from "@app/db/schemas";
import { Meter, TLicenseRegistry } from "@app/domains/platform/license/ce/module";
import { TProjectsDomain } from "@app/domains/platform/projects/ce/module";

export * from "./service/folder-roles";

export type TSecretsDeps = {
  projectsDomain: TProjectsDomain;
  licenseRegistry: TLicenseRegistry;
};

// Holds only its usage counter for now; it grows as Secret Manager moves into a domain.
export class SecretsModule {
  readonly name = "secrets";

  constructor({ projectsDomain, licenseRegistry }: TSecretsDeps) {
    licenseRegistry.registerUsageCounter({
      meter: Meter.SecretIdentities,
      count: (orgId) => projectsDomain.countProjectIdentities(ProjectType.SecretManager, orgId ?? undefined)
    });
  }
}
