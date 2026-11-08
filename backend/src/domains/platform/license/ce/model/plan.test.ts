import { Plan, TPlanFeature } from "./plan";

describe("Plan.assert", () => {
  test.each(Object.keys(Plan.featureNames) as TPlanFeature[])(
    "should refuse %s with a message naming it when the plan does not include it",
    (feature) => {
      // Setup
      const plan = Plan.restore({ ...Plan.community().toJSON(), [feature]: false });

      // Action
      const result = () => plan.assert(feature);

      // Assert
      expect(result).toThrow(`Your current plan does not include ${Plan.featureNames[feature]}. Upgrade your plan`);
    }
  );

  test("should allow a feature the plan includes", () => {
    // Setup
    const plan = Plan.restore({ ...Plan.community().toJSON(), externalKms: true as false });

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
      ...Plan.community().toJSON(),
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
    const pro = Plan.restore({ ...Plan.community().toJSON(), slug: "pro", identityLimit: 5 as unknown as null });
    const enforced = Plan.restore({
      ...Plan.community().toJSON(),
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

describe("Plan.community", () => {
  test("should be unpaid and include no paid feature", () => {
    // Setup
    const plan = Plan.community();

    // Action
    const paid = [plan.isPaid, plan.has("rbac"), plan.has("externalKms")];

    // Assert
    expect(paid).toEqual([false, false, false]);
  });

  test("should give each caller its own copy", () => {
    // Setup
    const first = Plan.community().toJSON();

    // Action
    first.rateLimits.readLimit = 1;

    // Assert
    expect(Plan.community().toJSON().rateLimits.readLimit).not.toBe(1);
  });
});

describe("Plan.withWorkspacesUsed", () => {
  test("should carry the count without changing the plan it came from", () => {
    // Setup
    const plan = Plan.restore({ ...Plan.community().toJSON(), slug: "pro" });

    // Action
    const counted = plan.withWorkspacesUsed(4);

    // Assert
    expect([counted.toJSON().workspacesUsed, plan.toJSON().workspacesUsed, counted.isPaid]).toEqual([4, 0, true]);
  });
});
