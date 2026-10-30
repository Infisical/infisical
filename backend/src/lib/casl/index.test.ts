import picomatch from "picomatch";
import { describe, expect, test } from "vitest";

import { getGlobMatcher, MAX_CACHED_GLOB_MATCHERS } from "./index";

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
