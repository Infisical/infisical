import type { InstanceEntitlements, TInstanceFeatures, TLicenseService } from "@app/domains/platform/license/ce/module";

// Innermost override last, so a spec can override inside an override and restore in any order.
const overrides: InstanceEntitlements[] = [];

// Server-wide, not per org: every org gets the instance's plan. Call the restore in afterAll and keep
// specs that rely on it in the same file.
export const overrideLicenseFeatures = (features: Partial<Record<keyof TInstanceFeatures, boolean | number>>) => {
  const { licenseService } = (globalThis as unknown as { testServices: { licenseService: TLicenseService } })
    .testServices;
  const overridden = licenseService
    .getInstanceEntitlements()
    .withFeatures(features as Partial<TInstanceFeatures>);
  overrides.push(overridden);
  // LicenseService reads the instance license only through this method, so the spy covers every check.
  const spy = vi.spyOn(licenseService, "getInstanceEntitlements").mockImplementation(() => overrides[overrides.length - 1]);

  return () => {
    overrides.splice(overrides.lastIndexOf(overridden), 1);
    if (!overrides.length) spy.mockRestore();
  };
};
