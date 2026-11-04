import { doesFieldValueMatchJwtPolicy } from "./identity-jwt-auth-fns";

describe("doesFieldValueMatchJwtPolicy", () => {
  test.each([
    { name: "matching scalar audience", value: "infisical", policy: "infisical", expected: true },
    { name: "different scalar audience", value: "other", policy: "infisical", expected: false },
    { name: "case-sensitive audience", value: "Infisical", policy: "infisical", expected: false },
    { name: "scalar wildcard policy", value: "service:production", policy: "service:*", expected: true },
    { name: "matching boolean claim", value: true, policy: "true", expected: true },
    { name: "different boolean claim", value: true, policy: "false", expected: false },
    { name: "matching numeric claim", value: 42, policy: "42", expected: true },
    { name: "different numeric claim", value: 42, policy: "43", expected: false },
    { name: "single matching audience", value: ["infisical"], policy: "infisical", expected: true },
    { name: "matching first audience", value: ["infisical", "other"], policy: "infisical", expected: true },
    { name: "matching later audience", value: ["other", "infisical"], policy: "infisical", expected: true },
    { name: "no matching audience", value: ["other", "another"], policy: "infisical", expected: false },
    { name: "empty audience array", value: [], policy: "infisical", expected: false },
    { name: "case-sensitive audience array", value: ["INFISICAL"], policy: "infisical", expected: false },
    { name: "wildcard in audience array", value: ["other", "service:production"], policy: "service:*", expected: true },
    { name: "unmatched wildcard in audience array", value: ["other", "another"], policy: "service:*", expected: false },
    { name: "boolean array claim", value: [false, true], policy: "true", expected: true },
    { name: "numeric array claim", value: [41, 42], policy: "42", expected: true },
    { name: "missing claim", value: undefined, policy: "infisical", expected: false },
    { name: "null claim", value: null, policy: "infisical", expected: false },
    { name: "object claim", value: { audience: "infisical" }, policy: "infisical", expected: false },
    { name: "nested audience array", value: [["infisical"]], policy: "infisical", expected: false },
    { name: "object in audience array", value: [{ audience: "infisical" }], policy: "infisical", expected: false }
  ])("matches $name", ({ value, policy, expected }) => {
    expect(doesFieldValueMatchJwtPolicy(value, policy)).toBe(expected);
  });
});
