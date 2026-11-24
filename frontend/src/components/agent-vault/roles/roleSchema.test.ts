import { describe, expect, it } from "vitest";

import { roleDetailsSchema } from "./roleSchema";

const nameError = (name: string) => {
  const result = roleDetailsSchema.safeParse({ name, slug: "release-engineers", description: "" });
  return result.success ? undefined : result.error.issues[0]?.message;
};

describe("roleDetailsSchema name", () => {
  it("trims the name before checking it, so only spaces counts as empty", () => {
    expect(nameError("   ")).toBe("Enter a name for the role.");
    const parsed = roleDetailsSchema.parse({
      name: "  Release Engineers ",
      slug: "release-engineers",
      description: ""
    });
    expect(parsed.name).toBe("Release Engineers");
  });

  it("refuses a built-in role's name in any case", () => {
    expect(nameError("Admin")).toBe(
      "This is the name of a built-in role. Choose a different name."
    );
    expect(nameError("no access")).toBe(
      "This is the name of a built-in role. Choose a different name."
    );
  });

  it("refuses invisible characters", () => {
    expect(nameError("Ad​min")).toMatch(/invisible characters/);
    expect(nameError("Release\tEngineers")).toMatch(/invisible characters/);
  });

  it("collapses any kind of space before comparing, and refuses characters that render blank", () => {
    const builtIn = "This is the name of a built-in role. Choose a different name.";
    expect(nameError("No\u00a0Access")).toBe(builtIn);
    expect(nameError("No  Access")).toBe(builtIn);
    expect(nameError("Admin\u2800")).toMatch(/invisible characters/);
    expect(nameError("\u3164")).toMatch(/invisible characters/);
    expect(
      roleDetailsSchema.parse({
        name: "Release\u00a0\u00a0Engineers",
        slug: "release-engineers",
        description: ""
      }).name
    ).toBe("Release Engineers");
  });

  it("takes an ordinary name", () => {
    expect(nameError("Release Engineers")).toBeUndefined();
  });
});
