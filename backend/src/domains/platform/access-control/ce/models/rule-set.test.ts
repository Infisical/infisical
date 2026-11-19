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

  test("should share the rule objects of a set without mustaches rather than copy them", () => {
    // Setup
    const rules = [allow("read", "secrets", { environment: "prod" }), allow("edit", "secrets", { environment: "dev" })];

    // Action
    const result = RuleSet.of(rules).interpolate(context);

    // Assert
    expect(result.rules[0]).toBe(rules[0]);
    expect(result.rules[1]).toBe(rules[1]);
  });

  test("should render block helpers, which are not bare expressions", () => {
    // Setup
    const template = "{{#if identity.metadata.env}}{{ identity.metadata.env }}{{else}}dev{{/if}}";
    const set = RuleSet.of([allow("read", "secrets", { environment: template })]);

    // Action
    const withoutEnv = set.interpolate({ identity: { metadata: {} } });
    const withEnv = set.interpolate({ identity: { metadata: { env: "prod" } } });

    // Assert
    expect(withoutEnv.rules[0].conditions).toEqual({ environment: "dev" });
    expect(withEnv.rules[0].conditions).toEqual({ environment: "prod" });
  });
});

describe("RuleSet.interpolate trimSuffix", () => {
  const trim = (namespace: string, pattern?: string) => {
    const template = pattern
      ? `{{ trimSuffix identity.auth.kubernetes.namespace '${pattern}' }}`
      : "{{ trimSuffix identity.auth.kubernetes.namespace }}";
    const [rule] = RuleSet.of([allow("read", "secrets", { environment: template })]).interpolate({
      identity: { auth: { kubernetes: { namespace } } }
    }).rules;
    return (rule.conditions as { environment: string }).environment;
  };

  test("should trim a matching glob suffix", () => {
    expect(trim("myapp-pr-1", "-pr-*")).toBe("myapp");
    expect(trim("myapp-pr-42", "-pr-*")).toBe("myapp");
  });

  test("should return the value unchanged when nothing matches the pattern", () => {
    expect(trim("myapp", "-pr-*")).toBe("myapp");
    expect(trim("myapp-mr-1", "-pr-*")).toBe("myapp-mr-1");
  });

  test("should remove the shortest matching suffix, not the longest", () => {
    expect(trim("app-pr-1", "-*")).toBe("app-pr");
  });

  test("should trim a literal suffix when the pattern has no glob syntax", () => {
    expect(trim("myapp-prod", "-prod")).toBe("myapp");
    expect(trim("myapp", "-prod")).toBe("myapp");
  });

  test("should support the wider glob syntax permission conditions use", () => {
    expect(trim("myapp-pr-1", "-{pr,mr}-*")).toBe("myapp");
    expect(trim("myapp-pr-1", "-pr-?")).toBe("myapp");
  });

  test("should leave an unresolved attribute literal intact so the condition fails closed", () => {
    expect(trim("{{identity.auth.kubernetes.namespace}}", "-pr-*")).toBe("{{identity.auth.kubernetes.namespace}}");
  });

  test("should return an empty string for an empty value", () => {
    expect(trim("", "-pr-*")).toBe("");
  });

  test("should return the value unchanged for a malformed pattern instead of throwing", () => {
    expect(trim("myapp-pr-1", "-pr-+(")).toBe("myapp-pr-1");
  });

  test("should return the value unchanged when no pattern is given", () => {
    expect(trim("myapp-pr-1")).toBe("myapp-pr-1");
  });

  test("should trim a pattern carrying the maximum number of wildcards", () => {
    expect(trim("myapp-1-2-3-4-5", "-*-*-*-*-*")).toBe("myapp");
    expect(trim("myapp-1-2-3-4-5", "-?-?-?-?-?")).toBe("myapp");
  });

  test("should return the value unchanged for a pattern with more wildcards than the limit", () => {
    expect(trim("myapp-1-2-3-4-5-6", "-*-*-*-*-*-*")).toBe("myapp-1-2-3-4-5-6");
    expect(trim("myapp-1-2-3-4-5-6", "-?-?-?-?-?-?")).toBe("myapp-1-2-3-4-5-6");
  });

  test("should count each character of a globstar toward the wildcard limit", () => {
    expect(trim("myapp-a-b", "-**-**")).toBe("myapp");
    expect(trim("myapp-a-b-c", "-**-**-**")).toBe("myapp-a-b-c");
  });

  test("should not count brace expansion toward the wildcard limit", () => {
    expect(trim("myapp-pr-1-2-3-4-5", "-{pr,mr}-*-*-*-*-*")).toBe("myapp");
  });

  test("should count wildcards in the pattern, not in the value", () => {
    expect(trim("my*app*x*y*z*w-pr-1", "-pr-*")).toBe("my*app*x*y*z*w");
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
