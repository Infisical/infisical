import { describe, expect, test } from "vitest";

import { doesAudValueMatchJwtPolicy, doesFieldValueMatchJwtPolicy } from "./identity-jwt-auth-fns";

describe("doesFieldValueMatchJwtPolicy", () => {
  test("matches equal boolean values", () => {
    expect(doesFieldValueMatchJwtPolicy(true, "true")).toBe(true);
    expect(doesFieldValueMatchJwtPolicy(false, "true")).toBe(false);
  });

  test("matches equal number values", () => {
    expect(doesFieldValueMatchJwtPolicy(42, "42")).toBe(true);
    expect(doesFieldValueMatchJwtPolicy(42, "43")).toBe(false);
  });

  test("matches exact and glob string values", () => {
    expect(doesFieldValueMatchJwtPolicy("system:serviceaccount:ns:sa", "system:serviceaccount:ns:sa")).toBe(true);
    expect(doesFieldValueMatchJwtPolicy("system:serviceaccount:ns:sa", "system:serviceaccount:ns:*")).toBe(true);
    expect(doesFieldValueMatchJwtPolicy("system:serviceaccount:ns:sa", "system:serviceaccount:other:*")).toBe(false);
  });
});

describe("doesAudValueMatchJwtPolicy", () => {
  test("matches an exact scalar aud", () => {
    expect(doesAudValueMatchJwtPolicy("infisical", "infisical")).toBe(true);
  });

  test("does not match a mismatched scalar aud", () => {
    expect(doesAudValueMatchJwtPolicy("infisical", "other")).toBe(false);
  });

  test("matches a glob scalar aud", () => {
    expect(doesAudValueMatchJwtPolicy("infisical-prod", "infisical-*")).toBe(true);
  });

  test("matches an array aud containing the configured audience (Kubernetes ServiceAccount shape)", () => {
    expect(doesAudValueMatchJwtPolicy(["infisical", "other"], "infisical")).toBe(true);
  });

  test("does not match an array aud that lacks the configured audience", () => {
    expect(doesAudValueMatchJwtPolicy(["foo", "bar"], "infisical")).toBe(false);
  });

  test("matches an array aud via a glob entry", () => {
    expect(doesAudValueMatchJwtPolicy(["foo", "infisical-prod"], "infisical-*")).toBe(true);
  });

  test("never throws on an array aud", () => {
    expect(() => doesAudValueMatchJwtPolicy(["infisical"], "infisical")).not.toThrow();
  });
});
