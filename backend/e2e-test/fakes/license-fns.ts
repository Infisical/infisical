import { TFeatureSet } from "@app/ee/services/license/license-types";

import { getDefaultOnPremFeatures as getMockDefaults } from "../../src/ee/services/license/__mocks__/license-fns";
import type * as RealLicenseFns from "../../src/ee/services/license/license-fns";

// The e2e instance runs on-prem with no license key, so getPlan answers with the feature set the
// license service took from getDefaultOnPremFeatures when it booted, by reference. Handing out one
// shared object means a spec can change the plan the running server sees without a restart.
// Wired up by test.alias in vitest.e2e.config.mts. Nothing under src/ references this file.
//
// The relative path to the unit-test mock is deliberate: the alias keys on the specifier
// "./license-fns", so this path is not itself aliased and does not resolve back to this file.
export { getLicenseKeyConfig } from "../../src/ee/services/license/__mocks__/license-fns";

// Shared through globalThis for the same reason as the AWS fakes: the alias makes this module
// reachable by more than one specifier, so it can be instantiated twice, and a spec would then
// configure a copy the server never reads.
const globalScope = globalThis as typeof globalThis & {
  infisicalFakeLicenseFeatures?: TFeatureSet;
};

globalScope.infisicalFakeLicenseFeatures ??= getMockDefaults() as TFeatureSet;

const features = globalScope.infisicalFakeLicenseFeatures;

export const getDefaultOnPremFeatures = (): TFeatureSet => features;

// Nothing forces a module replaced by an alias to match the module it replaces, so a change to the
// real feature set would otherwise leave this fake quietly wrong. This assignment fails
// type-checking instead.
export const assertFakeMatchesRealLicenseFns: Pick<typeof RealLicenseFns, "getDefaultOnPremFeatures"> = {
  getDefaultOnPremFeatures
};

export const fakeLicense = {
  // Mutates in place rather than replacing the object, since the license service holds a reference
  // to it from boot.
  reset: () => {
    Object.keys(features).forEach((key) => delete (features as Record<string, unknown>)[key]);
    Object.assign(features, getMockDefaults());
  },

  // Turns plan features on (or off) for the whole instance until the next reset.
  setFeatures: (overrides: Partial<TFeatureSet>) => {
    Object.assign(features, overrides);
  }
};
