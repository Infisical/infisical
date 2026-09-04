import { describe, expect, it } from "vitest";

import { isTokenExpiredError } from "./request";

describe("isTokenExpiredError", () => {
  it("should match 403 token expiry message from backend error handler", () => {
    expect(
      isTokenExpiredError({
        error: "TokenError",
        message: "Your token has expired. Please re-authenticate."
      })
    ).toBe(true);
  });

  it("should match 401 token expired substring", () => {
    expect(isTokenExpiredError({ message: "token expired" })).toBe(true);
    expect(isTokenExpiredError("token expired")).toBe(true);
  });

  it("should match stalesession substring", () => {
    expect(isTokenExpiredError("stalesession")).toBe(true);
  });

  it("should NOT match malformed or invalid algorithm token errors", () => {
    expect(
      isTokenExpiredError({
        error: "TokenError",
        message: "The provided access token is malformed. Please use a valid token or generate a new one and try again."
      })
    ).toBe(false);
    expect(
      isTokenExpiredError({
        error: "TokenError",
        message: "The access token is signed with an invalid algorithm. Please provide a valid token and try again."
      })
    ).toBe(false);
  });

  it("should NOT match standard permission 403 errors", () => {
    expect(
      isTokenExpiredError({
        error: "PermissionDenied",
        message: "You are not allowed to read on Secret"
      })
    ).toBe(false);
    expect(
      isTokenExpiredError({
        error: "ForbiddenRequestError",
        message: "Access denied"
      })
    ).toBe(false);
  });
});
