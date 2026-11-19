import {
  canonicalizeSecretPath,
  canonicalizeSecretPathPattern,
  hasDotPathSegment,
  sanitizeSqlLikeString
} from "./string";

describe("canonicalizeSecretPathPattern", () => {
  test.each([
    ["/", "/"],
    ["/**", "/**"],
    ["prod", "/prod"],
    ["prod/**", "/prod/**"],
    ["prod-*", "/prod-*"],
    ["//prod", "/prod"],
    ["/app//**", "/app/**"],
    ["/app/*/", "/app/*"],
    ["*", "*"],
    ["**", "**"],
    ["{/a,/b}", "{/a,/b}"],
    ["/app/{api,web}/**", "/app/{api,web}/**"],
    ["{/staging,/prod}/api", "{/staging,/prod}/api"],
    ["//{/staging,/prod}//api/", "/{/staging,/prod}/api"],
    ["**/prod", "**/prod"],
    ["**//prod/", "**/prod"],
    ["/app/*.env", "/app/*.env"],
    ["/app/[ab]*", "/app/[ab]*"],
    ["/app/!(tmp)/**", "/app/!(tmp)/**"]
  ])("canonicalizes %p to %p", (input, expected) => {
    expect(canonicalizeSecretPathPattern(input)).toBe(expected);
  });
});

describe("hasDotPathSegment", () => {
  test.each([
    ["/prod", false],
    ["/prod/**", false],
    ["/app/*.env", false],
    ["/prod.v2", false],
    ["/.", true],
    ["/prod/.", true],
    ["/prod/..", true],
    ["/a/../b", true],
    ["./prod", true],
    ["..", true]
  ])("reports %p as %p", (input, expected) => {
    expect(hasDotPathSegment(input)).toBe(expected);
  });
});

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
