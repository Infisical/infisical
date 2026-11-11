import { Permission, TPermissionRule } from "./permission";
import { closestWins, mergeRoles, overrideAt, scopedGrants, withFallback } from "./rule-composition";

type TSet = ["read" | "edit", "secrets"];
type TRule = TPermissionRule<TSet>;

const allow = (action: "read" | "edit", conditions?: Record<string, unknown>): TRule => ({
  action,
  subject: "secrets",
  conditions
});
const deny = (action: "read" | "edit", conditions?: Record<string, unknown>): TRule => ({
  action,
  subject: "secrets",
  conditions,
  inverted: true
});

const can = (rules: TRule[], action: "read" | "edit", fields?: Record<string, unknown>) =>
  Permission.fromRules<TSet>({ rules }).can({ action, subject: "secrets", fields });

describe("mergeRoles", () => {
  test("should keep a deny from one role even when another role allows the same action", () => {
    // Setup
    const layers = [[deny("edit")], [allow("edit")]];

    // Action
    const rules = mergeRoles({ layers });

    // Assert
    expect(can(rules, "edit")).toBe(false);
  });
});

describe("overrideAt", () => {
  test("should let an override decide where its conditions match and the base decide elsewhere", () => {
    // Setup
    const base = [allow("read")];
    const overrides = [deny("read", { secretPath: "/locked" })];

    // Action
    const rules = overrideAt({ base, overrides });

    // Assert
    expect(can(rules, "read", { secretPath: "/locked" })).toBe(false);
    expect(can(rules, "read", { secretPath: "/open" })).toBe(true);
  });
});

describe("scopedGrants", () => {
  test("should not let one grant's deny undo another grant's allow under the same conditions", () => {
    // Setup
    const conditions = { secretPath: "/app" };
    const grants = [
      { deny: [deny("edit")], allow: [allow("edit")], conditions },
      { deny: [deny("edit")], allow: [allow("read")], conditions }
    ];

    // Action
    const rules = scopedGrants({ grants });

    // Assert
    expect(can(rules, "edit", conditions)).toBe(true);
  });

  test("should apply each grant's rules only under its own conditions", () => {
    // Setup
    const grants = [{ deny: [], allow: [allow("edit")], conditions: { secretPath: "/app" } }];

    // Action
    const rules = scopedGrants({ grants });

    // Assert
    expect(can(rules, "edit", { secretPath: "/app" })).toBe(true);
    expect(can(rules, "edit", { secretPath: "/other" })).toBe(false);
  });
});

describe("closestWins", () => {
  test("should let the closest layer decide", () => {
    // Setup
    const layers = [[allow("edit")], [deny("edit")]];

    // Action
    const rules = closestWins({ layers });

    // Assert
    expect(can(rules, "edit")).toBe(false);
  });
});

describe("withFallback", () => {
  test("should add the fallback only when its condition holds", () => {
    // Setup
    const primary = [allow("read")];
    const fallback = [allow("edit")];

    // Action
    const withIt = withFallback({ primary, fallback, when: true });
    const without = withFallback({ primary, fallback, when: false });

    // Assert
    expect(can(withIt, "edit")).toBe(true);
    expect(can(without, "edit")).toBe(false);
  });
});
