import { describe, expect, test } from "vitest";

import { checkTenantOfTokens } from "./tenant-consent";

describe("checkTenantOfTokens", () => {
  test("should verify when both tokens come from the tenant", () => {
    // Action
    const outcome = checkTenantOfTokens("t1", { applicationTenantId: "t1", authorizationTenantId: "t1" });

    // Assert
    expect(outcome).toEqual({ verified: true });
  });

  test("should name the application token when it is from another tenant", () => {
    // Action
    const outcome = checkTenantOfTokens("t1", { applicationTenantId: "t2", authorizationTenantId: "t1" });

    // Assert
    expect(outcome).toEqual({
      verified: false,
      reason: "tenant-mismatch",
      token: "application",
      issuedByTenantId: "t2"
    });
  });

  test("should name the authorization token when it is from another tenant", () => {
    // Action
    const outcome = checkTenantOfTokens("t1", { applicationTenantId: "t1", authorizationTenantId: "t3" });

    // Assert
    expect(outcome).toEqual({
      verified: false,
      reason: "tenant-mismatch",
      token: "authorization",
      issuedByTenantId: "t3"
    });
  });
});
