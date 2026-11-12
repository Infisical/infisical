import { testFeatures } from "../testing/test-features";
import { InstanceEntitlements, InstanceType, TInstanceFeatures } from "./instance-entitlements";

const licensed = (instanceType: InstanceType) =>
  InstanceEntitlements.restore({
    instanceType,
    features: {
      ...testFeatures(),
      slug: "enterprise",
      rbac: true,
      fips: true
    },
    licenseId: "lic-1",
    customerId: null
  });

describe("InstanceEntitlements.plan", () => {
  test("should give every org the license's features, including the instance flags the admin console reads", () => {
    // Setup
    const instance = licensed(InstanceType.EnterpriseOnPremOffline);

    // Action
    const plan = instance.plan().toJSON() as TInstanceFeatures;

    // Assert
    expect(plan.rbac).toBe(true);
    expect(plan.fips).toBe(true);
  });
});

describe("InstanceEntitlements.withFeatures", () => {
  test("should replace the given features and leave the original unchanged", () => {
    // Setup
    const instance = InstanceEntitlements.restore({
      instanceType: InstanceType.OnPrem,
      features: testFeatures(),
      licenseId: null,
      customerId: null
    });

    // Action
    const overridden = instance.withFeatures({ rbac: true });

    // Assert
    expect([overridden.features.rbac, instance.features.rbac]).toEqual([true, false]);
  });
});

describe("InstanceEntitlements.licenseId", () => {
  test("should read unknown when the instance has no offline license", () => {
    // Setup
    const instance = InstanceEntitlements.restore({
      instanceType: InstanceType.OnPrem,
      features: testFeatures(),
      licenseId: null,
      customerId: null
    });

    // Action
    const { licenseId } = instance;

    // Assert
    expect(licenseId).toBe("unknown");
  });
});
