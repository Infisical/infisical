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

describe("BreakdownDimension.keys", () => {
  test("should offer exactly the seven breakdowns in the order the API documents them", () => {
    // Action
    const keys = BreakdownDimension.keys();

    // Assert
    expect(keys).toEqual([
      "identities",
      "user_identities",
      "secret_identities",
      "pam_identities",
      "internal_cas",
      "active_certs",
      "wildcard_certs"
    ]);
  });
});
