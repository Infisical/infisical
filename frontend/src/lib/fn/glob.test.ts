import { describe, expect, test } from "vitest";

import { isGlobSubsetOfGlob, literalPrefix } from "./glob";

describe("isGlobSubsetOfGlob", () => {
  test.each([
    ["/", "/"],
    ["/apps/**", "/apps/**"],
    ["/apps/**", "/apps/foo"],
    ["/apps/**", "/apps/foo/bar"],
    ["/apps/**", "/apps"],
    ["/apps/*", "/apps/foo"],
    ["/apps/**", "/apps/*"],
    ["/**", "/"],
    ["/**", "/apps/**"],
    ["/backend/*/folder", "/backend/api/folder"],
    ["/{a,b}/**", "/{a,b}/**"]
  ])("parent=%s contains %s", (parent, subset) =>
    expect(isGlobSubsetOfGlob(parent, subset)).toBe(true)
  );

  test.each([
    ["/apps/*", "/apps/**"],
    ["/apps/foo", "/apps/*"],
    ["/apps/foo", "/apps/foo/bar"],
    ["/apps/**", "/**"],
    ["/apps/**", "/secret/**"],
    ["/backend/*/folder", "/backend/**"],
    ["/{a,b}/*", "/a/**"],
    ["/**", "/{a,b}/**"],
    ["/foo*/*", "/foobar/**"]
  ])("parent=%s does not contain %s", (parent, subset) =>
    expect(isGlobSubsetOfGlob(parent, subset)).toBe(false)
  );
});

describe("literalPrefix", () => {
  test.each([
    ["/apps/foo", "/apps/foo"],
    ["/apps/**", "/apps/"],
    ["/**", "/"],
    ["/@(a|b)/**", "/"],
    ["/{a,b}", "/"]
  ])("literalPrefix(%s) is %s", (glob, prefix) => expect(literalPrefix(glob)).toBe(prefix));
});
