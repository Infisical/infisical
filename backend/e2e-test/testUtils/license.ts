import type { InstanceEntitlements, TInstanceFeatures } from "@app/domains/platform/license/ce/module";

type TEntitlementsHolder = {
  get: () => InstanceEntitlements;
  set: (entitlements: InstanceEntitlements) => void;
};

// Turns plan features on for the whole server until the returned function is called, for a spec
// that exercises a paid feature. The e2e license is a fixed default (see the ./license-fns alias in
// vitest.e2e.config.mts) and every org gets the instance's plan, so the override is not scoped to an
// org: call the restore in afterAll, and keep specs that read it in the same file.
export const overrideLicenseFeatures = (features: Partial<Record<keyof TInstanceFeatures, boolean | number>>) => {
  const { licenseEntitlements } = (globalThis as unknown as { testServices: { licenseEntitlements: TEntitlementsHolder } })
    .testServices;
  const original = licenseEntitlements.get();
  licenseEntitlements.set(original.withFeatures(features as Partial<TInstanceFeatures>));

  return () => {
    licenseEntitlements.set(original);
  };
};
