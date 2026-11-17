import { matchesSchema } from "./secret-sync-fns";

describe("matchesSchema with mirrored folders", () => {
  const mirroredFolders = new Set(["", "api"]);

  test("matches names in a mirrored folder", () => {
    expect(matchesSchema("DB_URL", "dev", undefined, { mirroredFolders })).toBe(true);
    expect(matchesSchema("api/DB_URL", "dev", undefined, { mirroredFolders })).toBe(true);
  });

  test("leaves names in other folders alone, even without a key schema", () => {
    expect(matchesSchema("team-a/DB_URL", "dev", undefined, { mirroredFolders })).toBe(false);
    expect(matchesSchema("api/nested/DB_URL", "dev", undefined, { mirroredFolders })).toBe(false);
  });

  test("applies the key schema to the last segment only", () => {
    expect(matchesSchema("api/INF_DB_URL", "dev", "INF_{{secretKey}}", { mirroredFolders })).toBe(true);
    expect(matchesSchema("api/DB_URL", "dev", "INF_{{secretKey}}", { mirroredFolders })).toBe(false);
  });

  test("leaves a name matching the key schema alone when its folder is not mirrored", () => {
    expect(matchesSchema("team-a/INF_DB_URL", "dev", "INF_{{secretKey}}", { mirroredFolders })).toBe(false);
  });
});
