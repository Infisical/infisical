import { BreakdownDimension } from "./breakdown-dimension";

describe("BreakdownDimension.fromKey", () => {
  test("should find a dimension by its meter key and be null for an unknown key", () => {
    // Setup
    const keys = ["identities", "pam_identities", "agent_vault_brokered_requests", "nope"];

    // Action
    const result = keys.map((key) => BreakdownDimension.fromKey(key));

    // Assert
    expect(result).toEqual([BreakdownDimension.Identities, BreakdownDimension.PamIdentities, null, null]);
  });
});
