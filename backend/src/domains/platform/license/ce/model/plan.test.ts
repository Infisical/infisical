import { getDefaultOnPremFeatures } from "./default-features";
import { Plan, PLAN_FEATURE_NAMES, TPlanFeature } from "./plan";

describe("Plan.assert", () => {
  test.each(Object.keys(PLAN_FEATURE_NAMES) as TPlanFeature[])(
    "should refuse %s with a message naming it when the plan does not include it",
    (feature) => {
      // Setup
      const plan = Plan.restore({ ...getDefaultOnPremFeatures(), [feature]: false });

      // Action
      const result = () => plan.assert(feature);

      // Assert
      expect(result).toThrow(`Your current plan does not include ${PLAN_FEATURE_NAMES[feature]}. Upgrade your plan`);
    }
  );

  test("should allow a feature the plan includes", () => {
    // Setup
    const plan = Plan.restore({ ...getDefaultOnPremFeatures(), externalKms: true as false });

    // Action
    const result = () => plan.assert("externalKms");

    // Assert
    expect(result).not.toThrow();
  });
});

describe("Plan.enforcedIdentityLimit", () => {
  test("should be uncapped for an enterprise plan that does not enforce its limit", () => {
    // Setup
    const plan = Plan.restore({
      ...getDefaultOnPremFeatures(),
      slug: "enterprise",
      identityLimit: 5 as unknown as null
    });

    // Action
    const limit = plan.enforcedIdentityLimit;

    // Assert
    expect(limit).toBeNull();
  });

  test("should keep a limit as a number when the plan is not enterprise, or enforces it", () => {
    // Setup
    const pro = Plan.restore({ ...getDefaultOnPremFeatures(), slug: "pro", identityLimit: 5 as unknown as null });
    const enforced = Plan.restore({
      ...getDefaultOnPremFeatures(),
      slug: "enterprise",
      identityLimit: 7 as unknown as null,
      enforceIdentityLimit: true
    });

    // Action
    const limits = [pro.enforcedIdentityLimit, enforced.enforcedIdentityLimit];

    // Assert
    expect(limits).toEqual([5, 7]);
  });
});
