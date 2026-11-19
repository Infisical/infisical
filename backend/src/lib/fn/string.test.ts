import { prefixWithSlash, removeTrailingSlash, sanitizeSqlLikeString } from "./string";

describe("sanitizeSqlLikeString", () => {
  test.each([
    ["plain", "plain"],
    ["https://service.ariba", "https://service.ariba"],
    ["100%", "100\\%"],
    ["%prod%", "\\%prod\\%"],
    ["foo_bar", "foo\\_bar"],
    ["a\\b", "a\\\\b"],
    ["mix_%\\", "mix\\_\\%\\\\"]
  ])("escapes LIKE wildcards in %p", (input, expected) => {
    expect(sanitizeSqlLikeString(input)).toBe(expected);
  });
});

describe("removeTrailingSlash", () => {
  test.each([
    ["/", "/"],
    ["///", "/"],
    ["/foo/", "/foo"],
    ["/foo//", "/foo"],
    ["https://example.com///", "https://example.com"],
    ["path", "path"],
    ["", ""]
  ])("removes trailing slashes from %p", (input, expected) => {
    expect(removeTrailingSlash(input)).toBe(expected);
  });
});

describe("prefixWithSlash", () => {
  test("prefixes with slash if missing", () => {
    expect(prefixWithSlash("foo")).toBe("/foo");
    expect(prefixWithSlash("/foo")).toBe("/foo");
  });
});

