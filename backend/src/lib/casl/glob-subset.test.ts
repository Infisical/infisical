import { haveDisjointLiteralPrefixes, isGlobSubsetOfGlob, literalPrefix } from "./glob-subset";

describe("isGlobSubsetOfGlob", () => {
  describe("identical patterns", () => {
    test.each([
      ["/", "/"],
      ["/apps", "/apps"],
      ["/apps/**", "/apps/**"],
      ["**", "**"]
    ])("%s ⊆ %s is true", (a, b) => expect(isGlobSubsetOfGlob(a, b)).toBe(true));
  });

  describe("subset narrower than parent", () => {
    test.each([
      ["/apps/**", "/apps/foo"],
      ["/apps/**", "/apps/foo/bar"],
      ["/apps/**", "/apps/foo/bar/baz"],
      ["/apps/*", "/apps/foo"],
      ["/apps/**", "/apps/*"],
      ["/**", "/apps/**"],
      ["/**", "/apps/foo"],
      ["**", "/apps/foo"],
      ["/apps/**", "/apps/"],
      ["/apps/**", "/apps"]
    ])("parent=%s, subset=%s → true", (parent, subset) => expect(isGlobSubsetOfGlob(parent, subset)).toBe(true));
  });

  describe("subset broader than parent (the bug case)", () => {
    test.each([
      ["/apps/*", "/apps/**"],
      ["/apps/*", "/apps/*/foo"],
      ["/apps/foo", "/apps/*"],
      ["/apps/foo", "/apps/**"],
      ["/apps/**", "/**"],
      ["/secret/**", "/**"]
    ])("parent=%s, subset=%s → false", (parent, subset) => expect(isGlobSubsetOfGlob(parent, subset)).toBe(false));
  });

  describe("disjoint literal segments", () => {
    test.each([
      ["/apps/*", "/secret/*"],
      ["/apps/**", "/secret/**"],
      ["/foo/bar", "/foo/baz"]
    ])("parent=%s, subset=%s → false", (parent, subset) => expect(isGlobSubsetOfGlob(parent, subset)).toBe(false));
  });

  describe("intra-segment wildcards (fall-back path)", () => {
    test("parent /hello/** does not contain subset /hello** (broader pattern, intra-segment)", () => {
      expect(isGlobSubsetOfGlob("/hello/**", "/hello**")).toBe(false);
    });

    test("subset matching exactly with intra-segment wildcards passes via reference equality", () => {
      expect(isGlobSubsetOfGlob("/hello*", "/hello*")).toBe(true);
    });
  });
});

describe("literalPrefix", () => {
  test.each([
    ["/apps/foo", "/apps/foo"],
    ["/apps/*", "/apps/"],
    ["/apps/**", "/apps/"],
    ["/**", "/"],
    ["**", ""],
    ["*foo", ""]
  ])("literalPrefix(%s) === %s", (input, expected) => expect(literalPrefix(input)).toBe(expected));
});

describe("haveDisjointLiteralPrefixes", () => {
  test.each([
    ["/apps/*", "/secret/*", true],
    ["/apps/**", "/secret/**", true],
    ["/foo/bar", "/foo/baz", true],
    ["/foo/bar", "/foo/bar", false],
    ["/**", "/secret/**", false],
    ["/apps/*", "/apps/**", false]
  ])("disjoint(%s, %s) === %s", (a, b, expected) => expect(haveDisjointLiteralPrefixes(a, b)).toBe(expected));
});
