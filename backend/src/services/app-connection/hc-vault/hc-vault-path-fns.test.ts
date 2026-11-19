import { hasHCVaultDotSegment } from "./hc-vault-path-fns";

describe("hasHCVaultDotSegment", () => {
  test.each(["kv", "kv/app/db", "apps/kv/prod/db", "app.v1/.env", "a..b/c.", "team#1/kv", "%zz/app"])(
    "accepts '%s'",
    (path) => {
      expect(hasHCVaultDotSegment(path)).toBe(false);
    }
  );

  test.each([".", "..", "kv/..", "../kv", "kv/../../other", "kv/./app", "kv/app/."])(
    "refuses the dot segment in '%s'",
    (path) => {
      expect(hasHCVaultDotSegment(path)).toBe(true);
    }
  );

  test.each(["%2e%2e", "%2E%2E", "%2e%2E", ".%2e", "%2e.", "%2e", "kv/%2e%2e/%2E%2E/other"])(
    "refuses the percent-encoded dot segment in '%s'",
    (path) => {
      expect(hasHCVaultDotSegment(path)).toBe(true);
    }
  );

  test.each(["kv/app%2f..%2fother", "kv/app%2F..%2Fother", "kv/app%5c..%5cother", "kv\\..\\other"])(
    "refuses a dot segment between encoded or backslash separators in '%s'",
    (path) => {
      expect(hasHCVaultDotSegment(path)).toBe(true);
    }
  );

  test.each(["kv/.\n./other", "kv/.\t./other", "kv/.\r./other"])(
    "refuses a dot segment containing a tab or line break in %j",
    (path) => {
      expect(hasHCVaultDotSegment(path)).toBe(true);
    }
  );

  test("accepts a double-encoded dot", () => {
    expect(hasHCVaultDotSegment("kv/%252e%252e/other")).toBe(false);
  });
});
