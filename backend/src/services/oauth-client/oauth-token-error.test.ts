import {
  BadRequestError,
  ForbiddenRequestError,
  NotFoundError,
  PermissionBoundaryError,
  UnauthorizedError
} from "@app/lib/errors";

import { OauthGrantType } from "./oauth-client-types";
import { OauthTokenError, OauthTokenErrorCode, toErrorDescription, toOauthTokenError } from "./oauth-token-error";

describe("OauthTokenError", () => {
  test("derives the status code from the RFC error code", () => {
    // RFC 6749 section 5.2 puts every code at 400 and allows 401 for invalid_client alone.
    expect(new OauthTokenError({ code: OauthTokenErrorCode.InvalidGrant, message: "x" }).statusCode).toBe(400);
    expect(new OauthTokenError({ code: OauthTokenErrorCode.InvalidRequest, message: "x" }).statusCode).toBe(400);
    expect(new OauthTokenError({ code: OauthTokenErrorCode.UnauthorizedClient, message: "x" }).statusCode).toBe(400);
    expect(new OauthTokenError({ code: OauthTokenErrorCode.InvalidTarget, message: "x" }).statusCode).toBe(400);
    expect(new OauthTokenError({ code: OauthTokenErrorCode.InvalidClient, message: "x" }).statusCode).toBe(401);
    expect(new OauthTokenError({ code: OauthTokenErrorCode.ServerError, message: "x" }).statusCode).toBe(500);
  });
});

describe("toOauthTokenError", () => {
  test("passes an already-mapped error through untouched", () => {
    const error = new OauthTokenError({ code: OauthTokenErrorCode.InvalidClient, message: "bad secret" });

    expect(toOauthTokenError(error)).toBe(error);
  });

  test("maps a rejected grant to invalid_grant on the redirect and refresh grants", () => {
    const rejected = new UnauthorizedError({ message: "Invalid or expired authorization code" });

    expect(toOauthTokenError(rejected, OauthGrantType.AuthorizationCode).oauthErrorCode).toBe(
      OauthTokenErrorCode.InvalidGrant
    );
    expect(toOauthTokenError(rejected, OauthGrantType.RefreshToken).oauthErrorCode).toBe(
      OauthTokenErrorCode.InvalidGrant
    );
  });

  // RFC 8693 section 2.2.2: a subject_token invalid for any reason, or unacceptable based on policy,
  // MUST be answered with invalid_request rather than the invalid_grant RFC 6749 would suggest.
  test("maps a rejected subject token to invalid_request on the exchange grant", () => {
    const mapped = toOauthTokenError(
      new UnauthorizedError({ message: "The subject token has expired." }),
      OauthGrantType.TokenExchange
    );

    expect(mapped.oauthErrorCode).toBe(OauthTokenErrorCode.InvalidRequest);
    expect(mapped.statusCode).toBe(400);
    expect(mapped.message).toBe("The subject token has expired.");
  });

  // getOrgPermission refuses a subject with ForbiddenRequestError where the exchange's own membership
  // checks refuse it with UnauthorizedError. Both are the user being unable to act, not an outage.
  test("maps a forbidden subject the same way as a rejected one", () => {
    const forbidden = new ForbiddenRequestError({
      message: "You are not a member of this organization with ID 8f2c."
    });

    const onExchange = toOauthTokenError(forbidden, OauthGrantType.TokenExchange);
    expect(onExchange.oauthErrorCode).toBe(OauthTokenErrorCode.InvalidRequest);
    expect(onExchange.statusCode).toBe(400);
    expect(onExchange.message).toBe("You are not a member of this organization with ID 8f2c.");

    expect(toOauthTokenError(forbidden, OauthGrantType.AuthorizationCode).oauthErrorCode).toBe(
      OauthTokenErrorCode.InvalidGrant
    );
  });

  // PermissionBoundaryError extends ForbiddenRequestError, so the one instanceof has to cover it.
  test("maps a permission boundary failure the same way", () => {
    const mapped = toOauthTokenError(
      new PermissionBoundaryError({ message: "Insufficient permissions" }),
      OauthGrantType.TokenExchange
    );

    expect(mapped.oauthErrorCode).toBe(OauthTokenErrorCode.InvalidRequest);
    expect(mapped.statusCode).toBe(400);
  });

  test("maps a bad request to invalid_request, keeping its message", () => {
    const mapped = toOauthTokenError(new BadRequestError({ message: "Missing 'subject_token'" }));

    expect(mapped.oauthErrorCode).toBe(OauthTokenErrorCode.InvalidRequest);
    expect(mapped.message).toBe("Missing 'subject_token'");
  });

  // Anything else escaped a path that was never meant to answer this endpoint, so its message was
  // written for a different envelope and could carry internals.
  test("maps anything else to a generic server_error and keeps the original for logging", () => {
    const original = new NotFoundError({ message: "auth_token_sessions row 41 not found" });
    const mapped = toOauthTokenError(original);

    expect(mapped.oauthErrorCode).toBe(OauthTokenErrorCode.ServerError);
    expect(mapped.statusCode).toBe(500);
    expect(mapped.message).not.toContain("auth_token_sessions");
    expect(mapped.error).toBe(original);
  });
});

describe("toErrorDescription", () => {
  // RFC 6749 section 5.2 allows only %x20-21 / %x23-5B / %x5D-7E.
  test("replaces the two characters the charset excludes", () => {
    expect(toErrorDescription('audience "api://x" is wrong')).toBe("audience 'api://x' is wrong");
    expect(toErrorDescription("path a\\b")).toBe("path a'b");
  });

  test("collapses everything outside the charset to single spaces", () => {
    expect(toErrorDescription("first\n\tsecondéthird")).toBe("first second third");
  });

  test("keeps the punctuation our messages actually use", () => {
    const message = "Set one up under Settings > SSO & Provisioning first. Yours uses 'HS256' (bad).";

    expect(toErrorDescription(message)).toBe(message);
  });

  test("bounds the length, so a schema failure cannot echo an unbounded issue list", () => {
    expect(toErrorDescription("a".repeat(900))).toHaveLength(512);
  });
});
