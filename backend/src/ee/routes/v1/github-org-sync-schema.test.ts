import { GithubOrgNamePatchSchema } from "./github-org-sync-schema";

describe("GithubOrgNamePatchSchema", () => {
  test("reports only the required-field error for a blank organization name", () => {
    const result = GithubOrgNamePatchSchema.safeParse("   ");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map(({ message }) => message)).toEqual(["GitHub Org Name is required"]);
    }
  });

  test("preserves character validation for non-empty organization names", () => {
    const result = GithubOrgNamePatchSchema.safeParse("invalid_org");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map(({ message }) => message)).toEqual([
        "GitHub Org Name can only contain alpha-numeric,hyphen"
      ]);
    }
  });

  test("accepts and trims a valid organization name", () => {
    expect(GithubOrgNamePatchSchema.parse(" infisical-labs ")).toBe("infisical-labs");
  });
});
