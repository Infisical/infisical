import { testFeatures } from "../testing/test-features";
import { Plan } from "./plan";
import { SeatUsage } from "./seat-usage";

const planWithIdentityLimit = (identityLimit: number | null) =>
  Plan.restore({ ...testFeatures(), slug: "pro", identityLimit });

describe("SeatUsage.assertAvailable", () => {
  test("should refuse a new member once the plan's cap is reached, naming the provisioning method", () => {
    // Setup
    const usage = SeatUsage.create({ membersUsed: 5, identitiesUsed: 5 });

    // Action
    const check = () => usage.assertAvailable(planWithIdentityLimit(5), "oidc");

    // Assert
    expect(check).toThrow("Failed to create new member via OIDC due to member limit reached.");
  });

  test("should allow a member below the cap, and any number when the plan has no cap", () => {
    // Setup
    const usage = SeatUsage.create({ membersUsed: 4, identitiesUsed: 4 });

    // Action
    const checks = () => {
      usage.assertAvailable(planWithIdentityLimit(5));
      SeatUsage.create({ membersUsed: 99, identitiesUsed: 99 }).assertAvailable(planWithIdentityLimit(null));
    };

    // Assert
    expect(checks).not.toThrow();
  });
});

describe("SeatUsage.fromBillableActors", () => {
  test("should count every member as an identity seat too", () => {
    // Action
    const usage = SeatUsage.fromBillableActors({ users: 3, identities: 4 });

    // Assert
    expect([usage.membersUsed, usage.identitiesUsed]).toEqual([3, 7]);
  });
});
