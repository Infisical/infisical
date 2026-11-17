import { createMongoAbility, subject } from "@casl/ability";
import picomatch from "picomatch";
import { describe, expect, test } from "vitest";

import { conditionsMatcher, getGlobMatcher, MAX_CACHED_GLOB_MATCHERS } from "./index";

describe("getGlobMatcher", () => {
  test("matches the same paths as picomatch.isMatch", () => {
    const patterns = ["/svc-*/**", "/**", "/app/*", "/app/{api,web}/**", "/exact"];
    const paths = [
      "/",
      "/svc-001",
      "/svc-001/cmp-1",
      "/svc-001/a/b",
      "/app",
      "/app/api",
      "/app/api/x",
      "/exact",
      "/exact/"
    ];

    for (const pattern of patterns) {
      for (const path of paths) {
        expect(getGlobMatcher(pattern)(path)).toBe(picomatch.isMatch(path, pattern, { strictSlashes: false }));
      }
    }
  });

  test("reuses the compiled matcher for a pattern", () => {
    expect(getGlobMatcher("/reused/**")).toBe(getGlobMatcher("/reused/**"));
  });

  test("evicts the oldest pattern once the cache is full", () => {
    const oldest = getGlobMatcher("/oldest/**");
    for (let i = 0; i < MAX_CACHED_GLOB_MATCHERS; i += 1) getGlobMatcher(`/filler-${i}/**`);

    expect(getGlobMatcher("/oldest/**")).not.toBe(oldest);
    expect(getGlobMatcher(`/filler-${MAX_CACHED_GLOB_MATCHERS - 1}/**`)).toBe(
      getGlobMatcher(`/filler-${MAX_CACHED_GLOB_MATCHERS - 1}/**`)
    );
  });
});

describe("conditionsMatcher", () => {
  const ability = createMongoAbility(
    [
      { action: "read", subject: "secrets" },
      { action: "read", subject: "secrets", inverted: true, conditions: { environment: "dev", secretPath: "/locked" } },
      {
        action: "edit",
        subject: "secrets",
        conditions: { environment: "dev", secretPath: { $glob: "/app/**" } }
      }
    ],
    { conditionsMatcher }
  );

  test.each(["/locked", "locked", "//locked", "/locked/", "/locked//"])(
    "applies an exact-path rule to %p, which names the same folder",
    (secretPath) => {
      expect(ability.can("read", subject("secrets", { environment: "dev", secretPath }))).toBe(false);
    }
  );

  test.each(["/app/api", "app/api", "//app//api", "/app/api/"])("applies a glob rule to %p", (secretPath) => {
    expect(ability.can("edit", subject("secrets", { environment: "dev", secretPath }))).toBe(true);
  });

  test.each([
    { secretPath: "//locked" },
    { secretPath: { $eq: "locked/" } },
    { secretPath: { $in: ["/other", "//locked"] } }
  ])("applies a rule saved with path %j to /locked", (conditions) => {
    const legacy = createMongoAbility(
      [
        { action: "read", subject: "secrets" },
        { action: "read", subject: "secrets", inverted: true, conditions: { environment: "dev", ...conditions } }
      ],
      { conditionsMatcher }
    );
    expect(legacy.can("read", subject("secrets", { environment: "dev", secretPath: "/locked" }))).toBe(false);
    expect(legacy.can("read", subject("secrets", { environment: "dev", secretPath: "//locked" }))).toBe(false);
  });

  test("applies a $ne rule saved with a non-canonical path", () => {
    const legacy = createMongoAbility(
      [{ action: "read", subject: "secrets", conditions: { secretPath: { $ne: "//locked" } } }],
      { conditionsMatcher }
    );
    expect(legacy.can("read", subject("secrets", { secretPath: "/locked" }))).toBe(false);
    expect(legacy.can("read", subject("secrets", { secretPath: "/open" }))).toBe(true);
  });

  test("leaves other folders and subjects without a path alone", () => {
    expect(ability.can("read", subject("secrets", { environment: "dev", secretPath: "/locked-out" }))).toBe(true);
    expect(ability.can("read", subject("secrets", { environment: "dev" }))).toBe(true);
    expect(ability.can("edit", subject("secrets", { environment: "dev", secretPath: "/db" }))).toBe(false);
  });
});
