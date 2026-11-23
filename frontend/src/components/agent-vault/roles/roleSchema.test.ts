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

  it("takes an ordinary name", () => {
    expect(nameError("Release Engineers")).toBeUndefined();
  });
});
