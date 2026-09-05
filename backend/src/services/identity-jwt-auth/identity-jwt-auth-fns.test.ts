import { describe, expect, test } from "vitest";

import { doesAudValueMatchJwtPolicy, doesFieldValueMatchJwtPolicy, hasJwtAudienceClaim } from "./identity-jwt-auth-fns";

describe("doesAudValueMatchJwtPolicy", () => {
  test("matches a scalar audience string", () => {
    expect(doesAudValueMatchJwtPolicy("infisical", "infisical")).toBe(true);
  });

  test("matches when the configured audience is a member of an array aud", () => {
    expect(doesAudValueMatchJwtPolicy(["infisical"], "infisical")).toBe(true);
    expect(doesAudValueMatchJwtPolicy(["other", "infisical"], "infisical")).toBe(true);
  });

  test("rejects an array aud that does not contain the configured audience", () => {
    expect(doesAudValueMatchJwtPolicy(["other"], "infisical")).toBe(false);
    expect(doesAudValueMatchJwtPolicy([], "infisical")).toBe(false);
  });

  test("matches glob policies against scalar and array aud", () => {
    expect(doesAudValueMatchJwtPolicy("prod-eu", "prod-*")).toBe(true);
    expect(doesAudValueMatchJwtPolicy(["staging", "prod-eu"], "prod-*")).toBe(true);
    expect(doesAudValueMatchJwtPolicy(["staging"], "prod-*")).toBe(false);
  });
});

describe("hasJwtAudienceClaim", () => {
  test("accepts a non-empty string or string array", () => {
    expect(hasJwtAudienceClaim("infisical")).toBe(true);
    expect(hasJwtAudienceClaim(["infisical"])).toBe(true);
  });

  test("rejects missing or empty audience values", () => {
    expect(hasJwtAudienceClaim(undefined)).toBe(false);
    expect(hasJwtAudienceClaim("")).toBe(false);
    expect(hasJwtAudienceClaim([])).toBe(false);
  });
});

describe("doesFieldValueMatchJwtPolicy", () => {
  test("still matches scalar strings used by subject and claims", () => {
    expect(doesFieldValueMatchJwtPolicy("system:serviceaccount:ns:sa", "system:serviceaccount:ns:sa")).toBe(true);
    expect(doesFieldValueMatchJwtPolicy("other", "infisical")).toBe(false);
  });
});
