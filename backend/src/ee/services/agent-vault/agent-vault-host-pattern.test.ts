import { describe, expect, test } from "vitest";

import {
  AgentVaultPatternRelation,
  hostPatternSchema,
  intersectHostPatterns,
  matchesHost,
  parseHostPatterns,
  relateHostPatterns
} from "./agent-vault-host-pattern";

const parseOne = (raw: string) => {
  const { patterns, errors } = parseHostPatterns(raw);
  expect(errors).toEqual([]);
  expect(patterns).toHaveLength(1);
  return patterns[0];
};

describe("matching a pattern against a concrete host", () => {
  test.each([
    { pattern: "api.github.com", host: "api.github.com", port: "443", expected: true, why: "exact host, default port" },
    { pattern: "api.github.com", host: "API.GitHub.com", port: "443", expected: true, why: "case-insensitive" },
    { pattern: "api.github.com", host: "api.github.com.", port: "443", expected: true, why: "trailing dot" },
    { pattern: "api.github.com", host: "api.github.com", port: "80", expected: false, why: "portless means 443" },
    { pattern: "api.github.com", host: "api.github.com", port: "8443", expected: false, why: "443 is concrete" },
    { pattern: "api.github.com:8443", host: "api.github.com", port: "8443", expected: true, why: "explicit port" },
    { pattern: "api.github.com", host: "other.github.com", port: "443", expected: false, why: "not a sibling" },
    { pattern: "*.github.com", host: "api.github.com", port: "443", expected: true, why: "one label" },
    { pattern: "*.github.com", host: "a.b.github.com", port: "443", expected: false, why: "not any depth" },
    { pattern: "*.github.com", host: "github.com", port: "443", expected: false, why: "a label is required" },
    { pattern: "*.github.com", host: "evilgithub.com", port: "443", expected: false, why: "the dot matters" },
    { pattern: "*.bar.foo.com", host: "api.foo.com", port: "443", expected: false, why: "label counts differ" },
    { pattern: "[::1]", host: "0:0:0:0:0:0:0:1", port: "443", expected: true, why: "IPv6 expanded" },
    { pattern: "[0:0:0:0:0:0:0:1]:8200", host: "::1", port: "8200", expected: true, why: "written the long way" },
    { pattern: "[2001:db8::1]", host: "2001:db8::2", port: "443", expected: false, why: "different addresses" },
    { pattern: "10.0.1.5:8200", host: "10.0.1.5", port: "8200", expected: true, why: "IPv4 literal" },
    { pattern: "[::ffff:192.0.2.1]", host: "192.0.2.1", port: "443", expected: true, why: "IPv4-mapped IPv6" },
    { pattern: "192.0.2.1", host: "::ffff:192.0.2.1", port: "443", expected: true, why: "and the other way round" },
    {
      pattern: "api.github.com, registry.npmjs.org",
      host: "registry.npmjs.org",
      port: "443",
      expected: true,
      why: "a column is a set"
    }
  ])("$pattern vs $host:$port -> $expected ($why)", ({ pattern, host, port, expected }) => {
    const { patterns, errors } = parseHostPatterns(pattern);
    expect(errors).toEqual([]);
    expect(patterns.some((candidate) => matchesHost(candidate, host, port))).toBe(expected);
  });
});

describe("the grammar", () => {
  test.each([
    { pattern: "https://api.github.com", why: "a scheme is not part of the grammar" },
    { pattern: "api.github.com/v1/safe", why: "the matcher sees the decoded path, the upstream the escaped one" },
    { pattern: "api.github.com/", why: "a bare trailing slash is still a path" },
    { pattern: "*", why: "a credential is always limited to specific hosts" },
    { pattern: "api.github.com:0", why: "port out of range" },
    { pattern: "api.github.com:70000", why: "port out of range" },
    { pattern: "api.github.com:https", why: "port must be numeric" },
    { pattern: "[::1", why: "unclosed IPv6 bracket" },
    { pattern: "[not-an-address]", why: "brackets must hold a valid IPv6 address" },
    { pattern: "api.*.github.com", why: "a wildcard is the leftmost label only" },
    { pattern: "api-*.github.com", why: "no mid-label globs; conflict detection depends on it" },
    { pattern: "api.github.com,", why: "an empty entry is a typo, not an empty set" },
    { pattern: "api.github.com, api.github.com:443", why: "the same normalized pattern twice" }
  ])("rejects $pattern ($why)", ({ pattern }) => {
    expect(hostPatternSchema.safeParse(pattern).success).toBe(false);
  });

  test.each([
    { pattern: "API.GitHub.com", normalized: "api.github.com:443" },
    { pattern: "api.github.com.", normalized: "api.github.com:443" },
    {
      pattern: " api.github.com , registry.npmjs.org:8443 ",
      normalized: "api.github.com:443,registry.npmjs.org:8443"
    },
    { pattern: "[::1]", normalized: "[0000:0000:0000:0000:0000:0000:0000:0001]:443" },
    { pattern: "[::ffff:10.0.1.5]:8200", normalized: "10.0.1.5:8200" }
  ])("derives the canonical key for $pattern", ({ pattern, normalized }) => {
    expect(
      parseHostPatterns(pattern)
        .patterns.map((candidate) => candidate.key)
        .join(",")
    ).toBe(normalized);
  });
});

describe("how two patterns relate", () => {
  test.each([
    { a: "api.foo.com", b: "api.foo.com", relation: "identical" },
    { a: "api.foo.com", b: "api.foo.com:443", relation: "identical" },
    { a: "api.foo.com", b: "*.foo.com", relation: "contained" },
    { a: "*.foo.com", b: "api.foo.com", relation: "contained" },
    { a: "*.foo.com", b: "*.bar.foo.com", relation: "disjoint" },
    { a: "api.foo.com:443", b: "api.foo.com:8443", relation: "disjoint" },
    { a: "*.foo.com", b: "api.foo.com:8443", relation: "disjoint" },
    { a: "api.foo.com", b: "api.bar.com", relation: "disjoint" }
  ])("$a vs $b is $relation", ({ a, b, relation }) => {
    expect(relateHostPatterns(parseOne(a), parseOne(b))).toBe(relation as AgentVaultPatternRelation);
  });
});

describe("overlap detection", () => {
  test("is an intersection, not set equality", () => {
    expect(intersectHostPatterns("api.foo.com, api.bar.com", "api.foo.com")).toEqual(["api.foo.com:443"]);
  });

  test("normalizes both sides before comparing", () => {
    expect(intersectHostPatterns("API.Foo.com.", "api.foo.com:443")).toEqual(["api.foo.com:443"]);
    expect(intersectHostPatterns("[::1]:8200", "[0:0:0:0:0:0:0:1]:8200")).toEqual([
      "[0000:0000:0000:0000:0000:0000:0000:0001]:8200"
    ]);
  });

  test("containment is not an intersection, so an override is allowed", () => {
    expect(intersectHostPatterns("*.foo.com", "api.foo.com")).toEqual([]);
  });

  test("a differing port is not an intersection", () => {
    expect(intersectHostPatterns("api.foo.com:443", "api.foo.com:8443")).toEqual([]);
  });
});

describe("errors name the offending entry", () => {
  test("a path says what to remove", () => {
    const { errors } = parseHostPatterns("api.github.com/v1/safe");
    expect(errors[0]).toContain("must not include a path");
    expect(errors[0]).toContain("api.github.com/v1/safe");
  });

  test("one bad entry does not hide the others", () => {
    const { patterns, errors } = parseHostPatterns("api.github.com, https://bad.com, *");
    expect(patterns.map((pattern) => pattern.key)).toEqual(["api.github.com:443"]);
    expect(errors).toHaveLength(2);
  });
});
