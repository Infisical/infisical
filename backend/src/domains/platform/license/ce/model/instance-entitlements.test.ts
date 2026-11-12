import { testFeatures } from "../testing/test-features";
import { InstanceEntitlements, InstanceFeature, InstanceType, TInstanceFeatures } from "./instance-entitlements";
import { PlanFeature } from "./plan";

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

describe("InstanceEntitlements.has", () => {
  test("should report the instance flags the license grants and refuse the ones it leaves out", () => {
    // Setup
    const instance = licensed(InstanceType.EnterpriseOnPremOffline);

    // Action
    const granted = [InstanceFeature.Fips, InstanceFeature.InstanceUserManagement].map((f) => instance.has(f));

    // Assert
    expect(granted).toEqual([true, false]);
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
    expect([overridden.plan().has(PlanFeature.Rbac), instance.plan().has(PlanFeature.Rbac)]).toEqual([true, false]);
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
