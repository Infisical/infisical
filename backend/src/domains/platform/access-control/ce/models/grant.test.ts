import { packRules } from "@casl/ability/extra";

import { Grant } from "./grant";

describe("Grant", () => {
  test("should be custom only under the custom slug", () => {
    // Setup
    const custom = Grant.restore({ slug: "custom" });
    const builtIn = Grant.restore({ slug: "admin" });

    // Action
    const results = [custom.isCustom(), builtIn.isCustom()];

    // Assert
    expect(results).toEqual([true, false]);
  });

  test("should match a built-in slug, and never a custom grant whatever the slug", () => {
    // Setup
    const builtIn = Grant.restore({ slug: "admin" });
    const custom = Grant.restore({ slug: "custom" });

    // Action
    const results = [builtIn.isBuiltIn("admin"), builtIn.isBuiltIn("member"), custom.isBuiltIn("custom")];

    // Assert
    expect(results).toEqual([true, false, false]);
  });

  test("should name its built-in slug, and none for a custom grant", () => {
    // Setup
    const builtIn = Grant.restore({ slug: "admin" });
    const custom = Grant.restore({ slug: "custom" });

    // Action
    const slugs = [builtIn.builtInSlug(), custom.builtInSlug()];

    // Assert
    expect(slugs).toEqual(["admin", null]);
  });

  test("should unpack the rules a custom grant carries", () => {
    // Setup
    const rules = [{ action: ["read"], subject: ["secrets"], conditions: { environment: "prod" } }];
    const grant = Grant.restore({ slug: "custom", packedRules: packRules(rules) });

    // Action
    const unpacked = grant.customRules();

    // Assert
    expect(unpacked).toMatchObject(rules);
  });

  test("should carry no rules for a built-in grant or a custom one without any", () => {
    // Setup
    const builtIn = Grant.restore({ slug: "admin", packedRules: packRules([{ action: "read", subject: "secrets" }]) });
    const empty = Grant.restore({ slug: "custom" });

    // Action
    const results = [builtIn.customRules(), empty.customRules()];

    // Assert
    expect(results).toEqual([[], []]);
  });
});
