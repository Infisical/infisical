import { describe, expect, test } from "vitest";

import {
  AgentVaultPatternRelation,
  hostPatternSchema,
  intersectHostPatterns,
  matchesHost,
  normalizeHostPattern,
  parseHostPatterns,
  relateHostPatterns
} from "./agent-vault-host-pattern";
import fixture from "./agent-vault-host-pattern-fixture.json";

const parseOne = (raw: string) => {
  const { patterns, errors } = parseHostPatterns(raw);
  expect(errors).toEqual([]);
  expect(patterns).toHaveLength(1);
  return patterns[0];
};

describe("agent vault host pattern grammar", () => {
  test.each(fixture.match)("$pattern vs $host:$port -> $expected ($why)", ({ pattern, host, port, expected }) => {
    const { patterns, errors } = parseHostPatterns(pattern);
    expect(errors).toEqual([]);
    expect(patterns.some((candidate) => matchesHost(candidate, host, port))).toBe(expected);
  });

  test.each(fixture.reject)("rejects $pattern ($why)", ({ pattern }) => {
    expect(hostPatternSchema.safeParse(pattern).success).toBe(false);
  });

  test.each(fixture.normalize)("normalizes $pattern", ({ pattern, normalized }) => {
    expect(normalizeHostPattern(pattern)).toBe(normalized);
    expect(hostPatternSchema.parse(pattern)).toBe(normalized);
  });

  test.each(fixture.relate)("$a vs $b is $relation", ({ a, b, relation }) => {
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
