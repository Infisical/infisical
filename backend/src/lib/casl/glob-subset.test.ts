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

  // Picomatch supports extglob (`@(a|b)`, `+(a|b)`, `!(...)`, `?(a|b)`, `*(a|b)`), brace expansion
  // (`{a,b}`), character classes (`[abc]`) and `?` at runtime. The old picomatch fallback compared
  // the subset pattern as a literal string, so a parent like `/@(public|shared)/*` wrongly
  // appeared to contain `/public/**` (the literal chars `**` match the parent's `*`). The fix
  // rejects any subset claim whenever either glob contains an unsupported metacharacter.
  describe("unsupported metacharacters reject the subset claim (escalation guard)", () => {
    test.each([
      // Extglob in parent — child uses `**` to widen scope across segments.
      ["/@(public|shared)/*", "/public/**"],
      ["/@(public|shared)/*", "/shared/**"],
      ["/+(foo|bar)/*", "/foo/**"],
      ["/+(foo|bar)/*", "/bar/**"],
      ["/!(public)/*", "/admin/**"],
      ["/?(opt)/*", "/opt/**"],
      ["/*(a|b)/*", "/a/**"],

      // Brace expansion in parent (documented feature) is just as unsafe via the old fallback.
      ["/{a,b}/*", "/a/**"],
      ["/{a,b,c}/**", "/{a,b}/**"],

      // Character classes and `?` in parent.
      ["/[ab]/*", "/a/**"],
      ["/h?llo/*", "/hello/**"],

      // Intra-segment `*` in parent.
      ["/foo*/*", "/foobar/**"],

      // Extglob / brace / char-class in subset → conservatively rejected even if the subset is
      // genuinely narrower (sound, not complete).
      ["/**", "/@(a|b)/**"],
      ["/**", "/{a,b}/**"],
      ["/**", "/[ab]/**"],
      ["/**", "/foo?/**"],
      ["/public/**", "/public/@(foo|bar)"],
      ["/public/**", "/public/{foo,bar}"]
    ])("parent=%s, subset=%s → false", (parent, subset) => expect(isGlobSubsetOfGlob(parent, subset)).toBe(false));
  });

  describe("identical extglob/brace/charclass patterns short-circuit via reference equality", () => {
    test.each([
      ["/@(public|shared)/*", "/@(public|shared)/*"],
      ["/+(foo|bar)/**", "/+(foo|bar)/**"],
      ["/!(public)/*", "/!(public)/*"],
      ["/?(opt)/*", "/?(opt)/*"],
      ["/{a,b}/**", "/{a,b}/**"],
      ["/[ab]/**", "/[ab]/**"],
      ["/h?llo/*", "/h?llo/*"],
      ["/foo*/*", "/foo*/*"]
    ])("isGlobSubsetOfGlob(%s, %s) → true", (parent, subset) => expect(isGlobSubsetOfGlob(parent, subset)).toBe(true));
  });
});

describe("literalPrefix", () => {
  test.each([
    ["/apps/foo", "/apps/foo"],
    ["/apps/*", "/apps/"],
    ["/apps/**", "/apps/"],
    ["/**", "/"],
    ["**", ""],
    ["*foo", ""],
    ["/@(secret|restricted)/**", "/"],
    ["/+(foo|bar)/**", "/"],
    ["/!(public)/**", "/"],
    ["/?(opt)/**", "/"],
    ["/foo(bar)/**", "/foo"]
  ])("literalPrefix(%s) === %s", (input, expected) => expect(literalPrefix(input)).toBe(expected));
});

describe("haveDisjointLiteralPrefixes", () => {
  test.each([
    ["/apps/*", "/secret/*", true],
    ["/apps/**", "/secret/**", true],
    ["/foo/bar", "/foo/baz", true],
    ["/foo/bar", "/foo/bar", false],
    ["/**", "/secret/**", false],
    ["/apps/*", "/apps/**", false],
    // Extglob deny region must not be proven disjoint from a literal path it actually matches.
    ["/@(secret|restricted)/**", "/secret/**", false],
    ["/+(foo|bar)/**", "/foo/**", false],
    ["/!(public)/**", "/secret/**", false]
  ])("disjoint(%s, %s) === %s", (a, b, expected) => expect(haveDisjointLiteralPrefixes(a, b)).toBe(expected));
});
