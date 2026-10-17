import type { TFeatureSet } from "@app/ee/services/license/license-types";

// Turns plan features on for the whole server until the returned function is called, for a spec
// that exercises a paid feature. The e2e license is a fixed default (see the ./license-fns alias in
// vitest.e2e.config.mts) and getPlan hands out this one object, so the override is not scoped to an
// org: call the restore in afterAll, and keep specs that read it in the same file.
export const overrideLicenseFeatures = (features: Partial<Record<keyof TFeatureSet, boolean | number>>) => {
  const { license } = (globalThis as unknown as { testServices: { license: { onPremFeatures: TFeatureSet } } })
    .testServices;
  const plan = license.onPremFeatures as unknown as Record<string, unknown>;
  const original = Object.fromEntries(Object.keys(features).map((key) => [key, plan[key]]));
  Object.assign(plan, features);

  return () => {
    Object.assign(plan, original);
  };
};
