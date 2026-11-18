import { RuleIdentity } from "./rule-identity";
import { RuleSet } from "./rule-set";

describe("RuleIdentity.toContext", () => {
  test("should expose the id, username and metadata", () => {
    // Setup
    const identity = RuleIdentity.create({ id: "i1", username: "alice", metadata: { team: "blue" } });

    const rules = RuleSet.of([
      {
        action: "read",
        subject: "secrets",
        conditions: { id: "{{identity.id}}", owner: "{{identity.username}}", team: "{{identity.metadata.team}}" }
      }
    ]);

    // Action
    const result = rules.interpolate(identity.toContext());

    // Assert
    expect(result.rules[0].conditions).toEqual({ id: "i1", owner: "alice", team: "blue" });
  });

  test("should render a missing metadata key back as its placeholder", () => {
    // Setup
    const identity = RuleIdentity.create({ id: "i1", username: "alice", metadata: {} });
    const rules = RuleSet.of([
      { action: "read", subject: "secrets", conditions: { team: "{{identity.metadata.team}}" } }
    ]);

    // Action
    const result = rules.interpolate(identity.toContext());

    // Assert
    expect(result.rules[0].conditions).toEqual({ team: "{{identity.metadata.team}}" });
  });

  test("should render a missing auth key back as its placeholder, and an empty string when the identity has no auth", () => {
    // Setup
    const withAuth = RuleIdentity.create({ id: "i1", username: "u", metadata: {}, auth: { region: "eu" } });
    const withoutAuth = RuleIdentity.create({ id: "i1", username: "u", metadata: {} });
    const rules = RuleSet.of([
      {
        action: "read",
        subject: "secrets",
        conditions: { region: "{{identity.auth.region}}", other: "{{identity.auth.other}}" }
      }
    ]);

    // Action
    const filled = rules.interpolate(withAuth.toContext());
    const unfilled = rules.interpolate(withoutAuth.toContext());

    // Assert
    expect(filled.rules[0].conditions).toEqual({ region: "eu", other: "{{identity.auth.other}}" });
    expect(unfilled.rules[0].conditions).toEqual({ region: "", other: "" });
  });

  test("should not change the metadata it was created with", () => {
    // Setup
    const metadata: Record<string, string> = { team: "blue" };
    const identity = RuleIdentity.create({ id: "i1", username: "alice", metadata });

    // Action
    RuleSet.of([
      { action: "read", subject: "secrets", conditions: { x: "{{identity.metadata.missing}}" } }
    ]).interpolate(identity.toContext());

    // Assert
    expect(metadata).toEqual({ team: "blue" });
  });
});
