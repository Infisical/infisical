import { RuleSet, TRuleLike } from "./rule-set";

const allow = (action: string | string[], subject: string | string[], conditions?: unknown): TRuleLike => ({
  action,
  subject,
  conditions
});

const cannot = (action: string | string[], subject: string | string[], conditions?: unknown): TRuleLike => ({
  action,
  subject,
  conditions,
  inverted: true
});

const allowed = (entries: Record<string, string[]>) =>
  new Map(Object.entries(entries).map(([subject, actions]) => [subject, new Set(actions)]));

describe("RuleSet.merge", () => {
  test("should put cannot rules last, keeping the order within each run", () => {
    // Setup
    const a1 = allow("read", "secrets");
    const c1 = cannot("edit", "secrets");
    const a2 = allow("edit", "folders");
    const c2 = cannot("read", "folders");

    // Action
    const merged = RuleSet.merge([
      [a1, c1],
      [a2, c2]
    ]);

    // Assert
    expect(merged.rules).toEqual([a1, a2, c1, c2]);
  });

  test("should hold no rules for no sets", () => {
    // Setup
    const sets: TRuleLike[][] = [];

    // Action
    const merged = RuleSet.merge(sets);

    // Assert
    expect(merged.rules).toEqual([]);
  });
});

describe("RuleSet.then", () => {
  test("should append the later rules after these without reordering", () => {
    // Setup
    const first = allow("read", "secrets");
    const denied = cannot("read", "secrets");
    const later = allow("read", "secrets", { environment: "prod" });

    // Action
    const result = RuleSet.of([first, denied]).then(RuleSet.of([later]));

    // Assert
    expect(result.rules).toEqual([first, denied, later]);
  });

  test("should leave both sets unchanged", () => {
    // Setup
    const base = RuleSet.of([allow("read", "secrets")]);
    const later = RuleSet.of([allow("edit", "secrets")]);

    // Action
    base.then(later);

    // Assert
    expect(base.rules).toHaveLength(1);
    expect(later.rules).toHaveLength(1);
  });
});

describe("RuleSet.interpolate", () => {
  const context = { identity: { id: "i1", username: "alice", metadata: { team: "blue" }, auth: {} } };

  test("should fill identity placeholders in conditions", () => {
    // Setup
    const set = RuleSet.of([
      allow("read", "secrets", {
        secretPath: { $glob: "/home/{{identity.username}}/**" },
        team: "{{identity.metadata.team}}"
      })
    ]);

    // Action
    const result = set.interpolate(context);

    // Assert
    expect(result.rules).toEqual([allow("read", "secrets", { secretPath: { $glob: "/home/alice/**" }, team: "blue" })]);
  });

  test("should return rules identical to the input for a set without mustaches", () => {
    // Setup
    const rules = [allow("read", "secrets", { environment: "prod" }), cannot("edit", "secrets")];

    // Action
    const result = RuleSet.of(rules).interpolate(context);

    // Assert
    expect(result.rules).toEqual(rules);
  });

  test("should leave the original set unchanged", () => {
    // Setup
    const set = RuleSet.of([allow("read", "secrets", { owner: "{{identity.username}}" })]);

    // Action
    set.interpolate(context);

    // Assert
    expect(set.rules).toEqual([allow("read", "secrets", { owner: "{{identity.username}}" })]);
  });
});

describe("RuleSet.interpolateStored", () => {
  const context = { identity: { id: "i1", username: "alice", metadata: {}, auth: {} } };

  test("should fill a rule that does not read identity.auth", () => {
    // Setup
    const set = RuleSet.of([allow("read", "secrets", { owner: "{{identity.username}}" })]);

    // Action
    const result = set.interpolateStored(context);

    // Assert
    expect(result.rules).toEqual([allow("read", "secrets", { owner: "alice" })]);
  });

  test("should keep a rule that mentions identity.auth untouched and fill the others", () => {
    // Setup
    const guarded = allow("read", "secrets", { account: "{{identity.auth.aws.accountId}}" });
    const set = RuleSet.of([guarded, allow("edit", "secrets", { owner: "{{identity.username}}" })]);

    // Action
    const result = set.interpolateStored(context);

    // Assert
    expect(result.rules).toEqual([guarded, allow("edit", "secrets", { owner: "alice" })]);
  });

  test("should return the same rules for a set without mustaches", () => {
    // Setup
    const rules = [allow("read", "secrets")];

    // Action
    const result = RuleSet.of(rules).interpolateStored(context);

    // Assert
    expect(result.rules).toEqual(rules);
  });
});

describe("RuleSet.narrowTo", () => {
  test("should drop allow rules on subjects out of scope", () => {
    // Setup
    const set = RuleSet.of([allow("read", "secrets"), allow("read", "members")]);

    // Action
    const result = set.narrowTo(allowed({ secrets: ["read"] }));

    // Assert
    expect(result.rules).toEqual([allow(["read"], "secrets")]);
  });

  test("should narrow the actions to the allowed ones and keep the conditions", () => {
    // Setup
    const conditions = { environment: "prod" };
    const set = RuleSet.of([allow(["read", "delete"], "secrets", conditions), allow("delete", "secrets")]);

    // Action
    const result = set.narrowTo(allowed({ secrets: ["read"] }));

    // Assert
    expect(result.rules).toEqual([allow(["read"], "secrets", conditions)]);
  });

  test("should expand manage to the allowed actions", () => {
    // Setup
    const set = RuleSet.of([allow("manage", "secrets")]);

    // Action
    const result = set.narrowTo(allowed({ secrets: ["read", "edit"] }));

    // Assert
    expect(result.rules).toEqual([allow(["read", "edit"], "secrets")]);
  });

  test("should expand the all subject to every allowed subject", () => {
    // Setup
    const set = RuleSet.of([allow("manage", "all")]);

    // Action
    const result = set.narrowTo(allowed({ secrets: ["read"], folders: ["edit"] }));

    // Assert
    expect(result.rules).toEqual([allow(["read"], "secrets"), allow(["edit"], "folders")]);
  });

  test("should keep cannot rules, since they only restrict", () => {
    // Setup
    const denied = cannot("edit", "members");
    const set = RuleSet.of([allow("read", "secrets"), denied]);

    // Action
    const result = set.narrowTo(allowed({ secrets: ["read"] }));

    // Assert
    expect(result.rules).toEqual([allow(["read"], "secrets"), denied]);
  });

  test("should split a rule over several subjects into one per allowed subject", () => {
    // Setup
    const set = RuleSet.of([allow("read", ["secrets", "members", "folders"])]);

    // Action
    const result = set.narrowTo(allowed({ secrets: ["read"], folders: ["read"] }));

    // Assert
    expect(result.rules).toEqual([allow(["read"], "secrets"), allow(["read"], "folders")]);
  });
});
