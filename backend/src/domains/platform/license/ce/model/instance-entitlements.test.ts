import { testFeatures } from "../testing/test-features";
import { InstanceEntitlements, InstanceType, TInstanceFeatures } from "./instance-entitlements";

const licensed = (instanceType: InstanceType) =>
  InstanceEntitlements.restore({
    instanceType,
    features: {
      ...testFeatures(),
      slug: "enterprise",
      rbac: true as false,
      fips: true as false
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

describe("InstanceEntitlements.isSelfHostedLicensed", () => {
  test("should be true only for an online or offline self-hosted license", () => {
    // Setup
    const types = [
      InstanceType.EnterpriseOnPrem,
      InstanceType.EnterpriseOnPremOffline,
      InstanceType.OnPrem,
      InstanceType.Cloud
    ];

    // Action
    const result = types.map((type) => licensed(type).isSelfHostedLicensed());

    // Assert
    expect(result).toEqual([true, true, false, false]);
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
    const overridden = instance.withFeatures({ rbac: true as false });

    // Assert
    expect([overridden.has("rbac"), instance.has("rbac")]).toEqual([true, false]);
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
