import { doesAudValueMatchJwtPolicy, doesFieldValueMatchJwtPolicy } from "./identity-jwt-auth-fns";

describe("doesAudValueMatchJwtPolicy", () => {
  test.each([
    { name: "matching scalar audience", value: "infisical", policy: "infisical", expected: true },
    { name: "different scalar audience", value: "other", policy: "infisical", expected: false },
    { name: "case-sensitive audience", value: "Infisical", policy: "infisical", expected: false },
    { name: "scalar wildcard policy", value: "service:production", policy: "service:*", expected: true },
    { name: "single matching audience", value: ["infisical"], policy: "infisical", expected: true },
    { name: "matching first audience", value: ["infisical", "other"], policy: "infisical", expected: true },
    { name: "matching later audience", value: ["other", "infisical"], policy: "infisical", expected: true },
    { name: "no matching audience", value: ["other", "another"], policy: "infisical", expected: false },
    { name: "empty audience array", value: [], policy: "infisical", expected: false },
    { name: "case-sensitive audience array", value: ["INFISICAL"], policy: "infisical", expected: false },
    { name: "wildcard in audience array", value: ["other", "service:production"], policy: "service:*", expected: true },
    { name: "unmatched wildcard in audience array", value: ["other", "another"], policy: "service:*", expected: false },
    { name: "boolean scalar audience", value: false, policy: "infisical", expected: false },
    { name: "numeric scalar audience", value: 42, policy: "42-service", expected: false },
    { name: "nonmatching audience with a boolean", value: ["other", false], policy: "infisical", expected: false },
    { name: "numeric audience array", value: [42], policy: "42-service", expected: false },
    {
      name: "matching audience followed by a boolean",
      value: ["infisical", false],
      policy: "infisical",
      expected: false
    },
    { name: "null followed by a matching audience", value: [null, "infisical"], policy: "infisical", expected: false },
    { name: "missing claim", value: undefined, policy: "infisical", expected: false },
    { name: "null claim", value: null, policy: "infisical", expected: false },
    { name: "object claim", value: { audience: "infisical" }, policy: "infisical", expected: false },
    { name: "nested audience array", value: [["infisical"]], policy: "infisical", expected: false },
    { name: "object in audience array", value: [{ audience: "infisical" }], policy: "infisical", expected: false }
  ])("matches $name", ({ value, policy, expected }) => {
    expect(doesAudValueMatchJwtPolicy(value, policy)).toBe(expected);
  });
});

describe("doesFieldValueMatchJwtPolicy", () => {
  test.each([
    { value: true, policy: "true", expected: true },
    { value: true, policy: "false", expected: false },
    { value: 42, policy: "42", expected: true },
    { value: 42, policy: "43", expected: false }
  ])("matches scalar claim $value against $policy", ({ value, policy, expected }) => {
    expect(doesFieldValueMatchJwtPolicy(value, policy)).toBe(expected);
  });
});
