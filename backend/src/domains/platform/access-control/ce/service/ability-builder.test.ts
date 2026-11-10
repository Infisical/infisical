import { MongoAbility, RawRuleOf } from "@casl/ability";
import { packRules } from "@casl/ability/extra";

import { buildRules, createAbility, denyAll } from "./ability-builder";

type TSet = ["read" | "edit", "secrets" | "folders"];
type TAbility = MongoAbility<TSet>;

const builtIn: Record<string, RawRuleOf<TAbility>[]> = {
  viewer: [{ action: "read", subject: "secrets" }],
  "no-edit": [{ action: "edit", subject: "secrets", inverted: true }]
};

const resolveRole = (role: string) => builtIn[role];

describe("buildRules", () => {
  test("should unpack a custom role's packed rules", () => {
    // Setup
    const packed = packRules<RawRuleOf<TAbility>>([{ action: "edit", subject: "folders" }]);

    // Action
    const ability = createAbility<TSet>(
      buildRules<TAbility>({
        entries: [{ role: "custom", permissions: packed }],
        customRoleSlug: "custom",
        resolveRole,
        onUnknownRole: "skip"
      })
    );

    // Assert
    expect(ability.can("edit", "folders")).toBe(true);
  });

  test("should sort inverted rules last so a cannot overrides a can from another role", () => {
    // Setup
    const packed = packRules<RawRuleOf<TAbility>>([{ action: "edit", subject: "secrets" }]);

    // Action
    const ability = createAbility<TSet>(
      buildRules<TAbility>({
        entries: [{ role: "no-edit" }, { role: "custom", permissions: packed }],
        customRoleSlug: "custom",
        resolveRole,
        onUnknownRole: "skip"
      })
    );

    // Assert
    expect(ability.can("edit", "secrets")).toBe(false);
  });

  test("should grant nothing for an unknown slug when told to skip it", () => {
    // Setup
    const entries = [{ role: "ssh-host-bootstrapper" }, { role: "viewer" }];

    // Action
    const rules = buildRules<TAbility>({ entries, customRoleSlug: "custom", resolveRole, onUnknownRole: "skip" });

    // Assert
    expect(rules).toEqual(builtIn.viewer);
  });

  test("should refuse the build for an unknown slug when told to throw", () => {
    // Setup
    const onUnknownRole = (role: string) => new Error(`Role '${role}' not found`);

    // Action
    const build = () =>
      buildRules<TAbility>({ entries: [{ role: "ghost" }], customRoleSlug: "custom", resolveRole, onUnknownRole });

    // Assert
    expect(build).toThrow("Role 'ghost' not found");
  });
});

describe("denyAll", () => {
  test("should allow nothing", () => {
    // Setup
    const ability = denyAll<TSet>();

    // Action
    const canRead = ability.can("read", "secrets");

    // Assert
    expect(canRead).toBe(false);
  });
});
