import type { InstanceEntitlements, TInstanceFeatures } from "@app/domains/platform/license/ce/module";

type TEntitlementsHolder = {
  get: () => InstanceEntitlements;
  set: (entitlements: InstanceEntitlements) => void;
};

// Server-wide, not per org: every org gets the instance's plan. Call the restore in afterAll and keep
// specs that rely on it in the same file.
export const overrideLicenseFeatures = (features: Partial<Record<keyof TInstanceFeatures, boolean | number>>) => {
  const { licenseEntitlements } = (globalThis as unknown as { testServices: { licenseEntitlements: TEntitlementsHolder } })
    .testServices;
  const original = licenseEntitlements.get();
  licenseEntitlements.set(original.withFeatures(features as Partial<TInstanceFeatures>));

  return () => {
    licenseEntitlements.set(original);
  };
};
