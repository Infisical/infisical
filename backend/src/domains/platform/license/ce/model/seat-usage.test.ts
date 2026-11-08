import { SeatUsage } from "./seat-usage";

describe("SeatUsage.assertAvailable", () => {
  test("should refuse a new member once the plan's cap is reached, naming the provisioning method", () => {
    // Setup
    const usage = SeatUsage.create({ membersUsed: 5, identitiesUsed: 5 });

    // Action
    const check = () => usage.assertAvailable({ identityLimit: 5, via: "oidc" });

    // Assert
    expect(check).toThrow("Failed to create new member via OIDC due to member limit reached.");
  });

  test("should allow a member below the cap, and any number when the plan has no cap", () => {
    // Setup
    const usage = SeatUsage.create({ membersUsed: 4, identitiesUsed: 4 });

    // Action
    const checks = () => {
      usage.assertAvailable({ identityLimit: 5 });
      SeatUsage.create({ membersUsed: 99, identitiesUsed: 99 }).assertAvailable({ identityLimit: null });
    };

    // Assert
    expect(checks).not.toThrow();
  });
});
