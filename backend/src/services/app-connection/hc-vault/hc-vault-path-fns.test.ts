import { hasHCVaultDotSegment, isHCVaultUrlPathPreserved } from "./hc-vault-path-fns";

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

  test.each(["kv/..#x", "kv/..?x", "kv/..#", "kv/..?", "kv/.. ", "kv/..\u0000", "kv/.%2e?x", "kv/.#x"])(
    "refuses a dot segment that ends at a query, fragment or trailing whitespace in %j",
    (path) => {
      expect(hasHCVaultDotSegment(path)).toBe(true);
    }
  );

  test.each(["kv?/../x", "kv#/../x", "kv?x/../../y", "kv/app#/.."])(
    "refuses a dot segment after a query or fragment in %j",
    (path) => {
      expect(hasHCVaultDotSegment(path)).toBe(true);
    }
  );

  test.each(["kv/..%23x", "kv/..%3Fx", "kv/a b", "kv/caf\u00e9", "kv/app#x", "kv/app?x", "kv/app#..", "kv/app?.."])(
    "accepts %j",
    (path) => {
      expect(hasHCVaultDotSegment(path)).toBe(false);
    }
  );

  test("accepts a double-encoded dot", () => {
    expect(hasHCVaultDotSegment("kv/%252e%252e/other")).toBe(false);
  });
});

describe("isHCVaultUrlPathPreserved", () => {
  test.each([
    "https://vault.example.com/v1/kv/data/team/app",
    "https://vault.example.com:8200/prefix/v1/kv/app",
    "https://vault.example.com/v1/kv/data/team app",
    "https://vault.example.com/v1/kv/data/caf\u00e9",
    "https://vault.example.com/v1/kv/data/a%23b",
    "https://vault.example.com/v1/kv/data/a%3Fb",
    "https://vault.example.com/v1/kv/data/100%",
    "https://vault.example.com/v1/kv/data/{env}",
    "https://vault.example.com/v1/team%231/kv/data/app"
  ])("accepts %j", (url) => {
    expect(isHCVaultUrlPathPreserved(url)).toBe(true);
  });

  test.each([
    "https://vault.example.com/v1/kv/data/a#b",
    "https://vault.example.com/v1/kv/data/a?b",
    "https://vault.example.com/v1/kv/data/a#",
    "https://vault.example.com/v1/kv/data/a?",
    "https://vault.example.com/v1/kv/data/a ",
    "https://vault.example.com/v1/kv/data/a\u0000",
    "https://vault.example.com/v1/kv/data/a\tb",
    "https://vault.example.com/v1/kv/data/a\\b",
    "https://vault.example.com/v1/kv/data/../other",
    "not a url"
  ])("refuses %j", (url) => {
    expect(isHCVaultUrlPathPreserved(url)).toBe(false);
  });
});
