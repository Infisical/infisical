import { testFeatures } from "../testing/test-features";
import { Plan, PlanFeature, PlanLimit, PlanProduct } from "./plan";

describe("Plan.assert", () => {
  test.each(Object.values(PlanFeature))(
    "should refuse %s with a message naming it when the plan does not include it",
    (feature) => {
      // Setup
      const plan = Plan.restore({ ...testFeatures(), [feature]: false });

      // Action
      const result = () => plan.assert(feature);

      // Assert
      expect(result).toThrow(`Your current plan does not include ${Plan.featureNames[feature]}. Upgrade your plan`);
    }
  );

  test("should allow a feature the plan includes", () => {
    // Setup
    const plan = Plan.restore({ ...testFeatures(), externalKms: true });

    // Action
    const result = () => plan.assert(PlanFeature.ExternalKms);

    // Assert
    expect(result).not.toThrow();
  });
});

describe("Plan.limit", () => {
  test("should be uncapped for an enterprise plan that does not enforce its identity limit", () => {
    // Setup
    const plan = Plan.restore({ ...testFeatures(), slug: "enterprise", identityLimit: 5 });

    // Action
    const limit = plan.limit(PlanLimit.Identities);

    // Assert
    expect(limit).toBeNull();
  });

  test("should keep an identity limit when the plan is not enterprise, or enforces it", () => {
    // Setup
    const pro = Plan.restore({ ...testFeatures(), slug: "pro", identityLimit: 5 });
    const enforced = Plan.restore({
      ...testFeatures(),
      slug: "enterprise",
      identityLimit: 7,
      enforceIdentityLimit: true
    });

    // Action
    const limits = [pro.limit(PlanLimit.Identities), enforced.limit(PlanLimit.Identities)];

    // Assert
    expect(limits).toEqual([5, 7]);
  });

  test("should read an identity limit of 0 as uncapped, but any other limit of 0 as a cap", () => {
    // Setup
    const plan = Plan.restore({ ...testFeatures(), slug: "pro", identityLimit: 0, honeyTokenLimit: 0 });

    // Action
    const limits = [plan.limit(PlanLimit.Identities), plan.limit(PlanLimit.HoneyTokens)];

    // Assert
    expect(limits).toEqual([null, 0]);
  });

  test("should take the larger CA grant when the internal CA limit is above the total", () => {
    // Setup
    const plans = [
      Plan.restore({ ...testFeatures(), maxCas: 2, maxInternalCas: 5 }),
      Plan.restore({ ...testFeatures(), maxCas: 1, maxInternalCas: null })
    ];

    // Action
    const limits = plans.map((plan) => plan.limit(PlanLimit.CertificateAuthorities));

    // Assert
    expect(limits).toEqual([5, 1]);
  });

  test("should be uncapped when an older offline license has no value for the limit", () => {
    // Setup
    const plan = Plan.restore({ ...testFeatures(), secretSyncLimit: undefined as unknown as null });

    // Action
    const limit = plan.limit(PlanLimit.SecretSyncs);

    // Assert
    expect(limit).toBeNull();
  });
});

describe("Plan.exceeds", () => {
  test("should refuse one more at the cap, and allow it below the cap", () => {
    // Setup
    const plan = Plan.restore({ ...testFeatures(), secretSyncLimit: 3 });

    // Action
    const results = [plan.exceeds(PlanLimit.SecretSyncs, 3), plan.exceeds(PlanLimit.SecretSyncs, 2)];

    // Assert
    expect(results).toEqual([true, false]);
  });

  test("should count everything being added, and only usage already over the cap when adding none", () => {
    // Setup
    const plan = Plan.restore({ ...testFeatures(), environmentLimit: 3 });

    // Action
    const results = [
      plan.exceeds(PlanLimit.Environments, 1, 3),
      plan.exceeds(PlanLimit.Environments, 3, 0),
      plan.exceeds(PlanLimit.Environments, 4, 0)
    ];

    // Assert
    expect(results).toEqual([true, false, true]);
  });

  test("should never refuse when the plan has no cap", () => {
    // Setup
    const plan = Plan.restore({ ...testFeatures(), secretSyncLimit: null });

    // Action
    const result = plan.exceeds(PlanLimit.SecretSyncs, 1_000_000, 50);

    // Assert
    expect(result).toBe(false);
  });
});

describe("Plan.isPaid", () => {
  test("should be paid only with a slug from the License Server", () => {
    // Setup
    const plans = [Plan.restore(testFeatures()), Plan.restore({ ...testFeatures(), slug: "pro" })];

    // Action
    const paid = plans.map((plan) => plan.isPaid);

    // Assert
    expect(paid).toEqual([false, true]);
  });
});

describe("Plan.withWorkspacesUsed", () => {
  test("should carry the count without changing the plan it came from", () => {
    // Setup
    const plan = Plan.restore({ ...testFeatures(), slug: "pro" });

    // Action
    const counted = plan.withWorkspacesUsed(4);

    // Assert
    expect([counted.toJSON().workspacesUsed, plan.toJSON().workspacesUsed, counted.isPaid]).toEqual([4, 0, true]);
  });
});

describe("Plan.allows", () => {
  test("should keep a product available unless the plan explicitly switches it off", () => {
    // Setup
    const plans = [null, true, false].map((pam) => Plan.restore({ ...testFeatures(), pam }));

    // Action
    const allowed = plans.map((plan) => plan.allows(PlanProduct.Pam));

    // Assert
    expect(allowed).toEqual([true, true, false]);
  });
});

describe("Plan immutability", () => {
  test("should not change when the props it was restored from change afterwards", () => {
    // Setup
    const props = { ...testFeatures(), rbac: true };
    const plan = Plan.restore(props);

    // Action
    props.rbac = false;
    props.rateLimits.readLimit = 1;

    // Assert
    expect([plan.has(PlanFeature.Rbac), plan.rateLimits.readLimit]).toEqual([
      true,
      testFeatures().rateLimits.readLimit
    ]);
  });

  test("should refuse a write to its nested data", () => {
    // Setup
    const plan = Plan.restore(testFeatures());

    // Action
    const write = () => {
      (plan.rateLimits as { readLimit: number }).readLimit = 1;
    };

    // Assert
    expect(write).toThrow(TypeError);
  });

  test("should hand out a copy from toJSON that can change without changing the plan", () => {
    // Setup
    const plan = Plan.restore({ ...testFeatures(), rbac: true });

    // Action
    const json = plan.toJSON();
    json.rbac = false;

    // Assert
    expect(plan.has(PlanFeature.Rbac)).toBe(true);
  });
});
