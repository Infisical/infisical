import { canonicalizeSecretPath, sanitizeSqlLikeString } from "./string";

describe("canonicalizeSecretPath", () => {
  test.each([
    ["/", "/"],
    ["", "/"],
    ["//", "/"],
    ["/prod", "/prod"],
    ["prod", "/prod"],
    ["//prod", "/prod"],
    ["/prod/", "/prod"],
    ["/prod//", "/prod"],
    ["/app//api///svc", "/app/api/svc"],
    ["/app/**", "/app/**"]
  ])("canonicalizes %p to %p", (input, expected) => {
    expect(canonicalizeSecretPath(input)).toBe(expected);
  });
});

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
