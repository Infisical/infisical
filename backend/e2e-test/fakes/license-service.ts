import { seedData1 } from "@app/db/seed-data";
import { TFeatureSet } from "@app/ee/services/license/license-types";

import * as RealLicenseService from "../../src/ee/services/license/license-service";

// Plans belong to an organization, so the fake keys them by org: a spec turns features on for an
// org it created, and no other org's plan moves. Specs stay isolated whatever order they run in.
// Wired up by test.alias in vitest.e2e.config.mts. Nothing under src/ references this file.
//
// The e2e server runs on-prem, where the real getPlan ignores the org and answers with one
// instance-wide plan, so the override sits here rather than in license-fns. Only getPlan is
// replaced; the rest of the service, including the instance-wide onPremFeatures, stays real.
//
// The relative path to the real module is deliberate: the alias keys on the specifier
// "@app/ee/services/license/license-service", so this path is not itself aliased and does not
// resolve back to this file.
export type { TLicenseServiceFactory } from "../../src/ee/services/license/license-service";

// TFeatureSet types several flags as the literal `false` (the unlicensed default), so a plain
// Partial<TFeatureSet> would refuse `true`. Widen those literals to boolean.
type TFeatureOverrides = {
  [K in keyof TFeatureSet]?: TFeatureSet[K] extends boolean ? boolean : TFeatureSet[K];
};

// Shared through globalThis for the same reason as the AWS fakes: the alias makes this module
// reachable by more than one specifier, so it can be instantiated twice, and a spec would then
// configure a copy the server never reads.
const globalScope = globalThis as typeof globalThis & {
  infisicalFakeLicenseOverrides?: Map<string, TFeatureOverrides>;
};

globalScope.infisicalFakeLicenseOverrides ??= new Map();

const overridesByOrg = globalScope.infisicalFakeLicenseOverrides;

export const licenseServiceFactory: typeof RealLicenseService.licenseServiceFactory = (deps) => {
  const service = RealLicenseService.licenseServiceFactory(deps);
  const realGetPlan = service.getPlan;

  // Assigned onto the real service rather than spread into a copy, because the service exposes
  // onPremFeatures as a getter and a spread would freeze it at its boot value.
  service.getPlan = async (orgId, projectId) => {
    const plan = await realGetPlan(orgId, projectId);
    const overrides = overridesByOrg.get(orgId);
    return overrides ? ({ ...plan, ...overrides } as TFeatureSet) : plan;
  };

  return service;
};

export const fakeLicense = {
  reset: () => {
    overridesByOrg.clear();
  },

  // Turns plan features on (or off) for one org until the next reset. The seeded org is shared by
  // every spec that logs in as the seeded user, so a spec must create its own org to change a plan.
  setFeatures: (orgId: string, overrides: TFeatureOverrides) => {
    if (orgId === seedData1.organization.id) {
      throw new Error(
        "fakeLicense.setFeatures: the seeded org is shared across specs. Create an org for this spec (eg createIsolatedOrgAndProject) and change its plan instead."
      );
    }
    overridesByOrg.set(orgId, { ...overridesByOrg.get(orgId), ...overrides });
  }
};
