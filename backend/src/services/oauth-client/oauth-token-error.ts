import jwt from "jsonwebtoken";

import { BadRequestError, ForbiddenRequestError, UnauthorizedError } from "@app/lib/errors";

import { OauthGrantType } from "./oauth-client-types";

// The token endpoint answers in the shape RFC 6749 §5.2 defines, extended by `invalid_target` from
// RFC 8693 §2.2.2. Generic OAuth client libraries branch on the `error` code, so the house envelope
// (`{ statusCode, message, error: "UnauthorizedError" }`) leaves them unable to tell "rotate the client
// secret" from "re-authenticate the user" from "retry later". It is the only endpoint that does this.
export enum OauthTokenErrorCode {
  InvalidRequest = "invalid_request",
  InvalidClient = "invalid_client",
  InvalidGrant = "invalid_grant",
  UnauthorizedClient = "unauthorized_client",
  UnsupportedGrantType = "unsupported_grant_type",
  InvalidScope = "invalid_scope",
  InvalidTarget = "invalid_target",
  ServerError = "server_error"
}

// RFC 6749 §5.2 puts every code at 400 and allows 401 for `invalid_client` alone. `server_error` is not
// in that list (it belongs to the authorization endpoint), but 500 is what tells a client to retry
// rather than rewrite.
const STATUS_CODE_BY_ERROR_CODE: Record<OauthTokenErrorCode, number> = {
  [OauthTokenErrorCode.InvalidRequest]: 400,
  [OauthTokenErrorCode.InvalidClient]: 401,
  [OauthTokenErrorCode.InvalidGrant]: 400,
  [OauthTokenErrorCode.UnauthorizedClient]: 400,
  [OauthTokenErrorCode.UnsupportedGrantType]: 400,
  [OauthTokenErrorCode.InvalidScope]: 400,
  [OauthTokenErrorCode.InvalidTarget]: 400,
  [OauthTokenErrorCode.ServerError]: 500
};

// RFC 6749 §5.2 allows only printable ASCII without `"` or `\`. Messages are written for a human
// reading a terminal, so normalise at the boundary rather than constraining every throw site. The cap is
// for schema failures, whose issue list is otherwise unbounded.
const MAX_ERROR_DESCRIPTION_LENGTH = 512;
const DISALLOWED_DESCRIPTION_CHARS = /[^\x20-\x21\x23-\x5B\x5D-\x7E]/g;

export const toErrorDescription = (message: string) =>
  message
    .replace(/["\\]/g, "'")
    .replace(DISALLOWED_DESCRIPTION_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_ERROR_DESCRIPTION_LENGTH);

export class OauthTokenError extends Error {
  name: string;

  oauthErrorCode: OauthTokenErrorCode;

  statusCode: number;

  error: unknown;

  constructor({ code, message, error }: { code: OauthTokenErrorCode; message: string; error?: unknown }) {
    super(message);
    this.name = "OauthTokenError";
    this.oauthErrorCode = code;
    this.statusCode = STATUS_CODE_BY_ERROR_CODE[code];
    this.error = error;
  }
}

// RFC 8693 §2.2.2 overrides RFC 6749 for token exchange: a `subject_token` "invalid for any reason, or
// unacceptable based on policy" MUST be answered with `invalid_request`, where the same failure on the
// redirect and refresh grants is `invalid_grant`. So a rejected grant's code depends on the grant.
const REJECTED_GRANT_CODE_BY_GRANT_TYPE: Record<OauthGrantType, OauthTokenErrorCode> = {
  [OauthGrantType.AuthorizationCode]: OauthTokenErrorCode.InvalidGrant,
  [OauthGrantType.RefreshToken]: OauthTokenErrorCode.InvalidGrant,
  [OauthGrantType.TokenExchange]: OauthTokenErrorCode.InvalidRequest
};

// Translates whatever escaped the token endpoint into an RFC code, keying off the error class and never
// the message text. Sites where the class default is wrong throw `OauthTokenError` directly and pass
// through untouched.
//
// `UnauthorizedError` and `ForbiddenRequestError` both mean a grant we will not act on (a bad
// authorization code, refresh token or subject token, or a subject we cannot resolve to a usable
// account), so they take whichever code that grant owes. Both are needed because the exchange refuses an
// unusable subject in two vocabularies: its own membership checks raise the first, while
// `getOrgPermission` raises the second for the same kind of refusal, and mapping only one would answer
// half of them with an unexplained 500. Client authentication throws `invalid_client` explicitly instead,
// because there it is the client that failed rather than the token. Anything else is a bug or an outage,
// so it becomes a generic `server_error`: its message was written for a different envelope and could
// carry internals.
export const toOauthTokenError = (error: unknown, grantType?: OauthGrantType): OauthTokenError => {
  if (error instanceof OauthTokenError) return error;

  if (error instanceof UnauthorizedError || error instanceof ForbiddenRequestError) {
    const code = grantType ? REJECTED_GRANT_CODE_BY_GRANT_TYPE[grantType] : OauthTokenErrorCode.InvalidGrant;

    return new OauthTokenError({ code, message: error.message, error });
  }

  if (error instanceof jwt.JsonWebTokenError) {
    const code = grantType ? REJECTED_GRANT_CODE_BY_GRANT_TYPE[grantType] : OauthTokenErrorCode.InvalidGrant;
    return new OauthTokenError({
      code,
      message: "The token presented with this grant is expired or invalid. Obtain a new one.",
      error
    });
  }

  if (error instanceof BadRequestError) {
    return new OauthTokenError({ code: OauthTokenErrorCode.InvalidRequest, message: error.message, error });
  }

  return new OauthTokenError({
    code: OauthTokenErrorCode.ServerError,
    message: "The authorization server could not complete the token request.",
    error
  });
};
