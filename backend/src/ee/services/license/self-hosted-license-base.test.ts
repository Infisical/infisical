import { projectV2ToFeatureSet } from "@app/services/license-client/entitlement-projection";
import { TEntitlementsResponse } from "@app/services/license-client/license-client-types";

import { getDefaultOnPremFeatures } from "./license-fns";
import { withSelfHostedLicenseBase } from "./self-hosted-license-base";

const entitlements = (features: TEntitlementsResponse["features"]) =>
  ({ slug: "enterprise", features, products: [] }) as unknown as TEntitlementsResponse;

describe("withSelfHostedLicenseBase", () => {
  test("a v1 key without maxCas leaves CAs uncapped instead of the free tier's single CA", () => {
    const features = { maxInternalCas: 10 } as Partial<ReturnType<typeof getDefaultOnPremFeatures>>;
    const plan = { ...withSelfHostedLicenseBase(getDefaultOnPremFeatures()), ...features };
    expect(plan.maxCas).toBeNull();
    expect(plan.maxInternalCas).toBe(10);
  });

  test("a v1 key that sets maxCas keeps it", () => {
    const plan = { ...withSelfHostedLicenseBase(getDefaultOnPremFeatures()), maxCas: 3 };
    expect(plan.maxCas).toBe(3);
  });

  test("v2 entitlements without max_cas leave CAs uncapped; with it, the cap applies", () => {
    const base = withSelfHostedLicenseBase(getDefaultOnPremFeatures());
    expect(projectV2ToFeatureSet(base, entitlements({})).maxCas).toBeNull();
    expect(projectV2ToFeatureSet(base, entitlements({ max_cas: { value: 4 } })).maxCas).toBe(4);
  });

  test("the defaults other paths use keep the free tier's single CA", () => {
    expect(getDefaultOnPremFeatures().maxCas).toBe(1);
    expect(projectV2ToFeatureSet(getDefaultOnPremFeatures(), entitlements({})).maxCas).toBe(1);
  });
});
