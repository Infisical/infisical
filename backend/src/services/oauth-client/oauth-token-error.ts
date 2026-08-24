import { BadRequestError, UnauthorizedError } from "@app/lib/errors";

import { OauthGrantType } from "./oauth-client-types";

// The token endpoint answers failures in the shape RFC 6749 section 5.2 defines, extended by the
// `invalid_target` code from RFC 8693 section 2.2.2: a JSON body carrying an `error` code from a fixed
// list plus a human-readable `error_description`. Generic OAuth client libraries branch on that code,
// so the house envelope (`{ statusCode, message, error: "UnauthorizedError" }`) leaves them unable to
// tell "rotate the client secret" from "re-authenticate the user" from "retry later".
//
// This is the only endpoint that responds this way. It exists because the endpoint's contract is the
// RFC rather than our own API conventions.
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

// RFC 6749 section 5.2 puts every code at 400 and allows 401 for `invalid_client` alone. `server_error`
// is not in that list (it belongs to the authorization endpoint) but is the conventional code for a
// request the server cannot fulfil, and 500 is what tells a client to retry rather than rewrite.
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

// RFC 6749 section 5.2 restricts error_description to %x20-21 / %x23-5B / %x5D-7E: printable ASCII
// without the double quote or the backslash. Messages here are written for a human reading a terminal,
// not filtered for that, so normalise at the boundary rather than constraining every throw site. The cap
// is there because a schema failure can otherwise carry an issue list of unbounded length.
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

// RFC 8693 section 2.2.2 overrides RFC 6749 for the token-exchange grant, and not in the direction you
// would guess: a `subject_token` that is "invalid for any reason, or unacceptable based on policy" MUST
// be answered with `invalid_request`, where the same class of failure on the redirect and refresh grants
// is `invalid_grant` under RFC 6749 section 5.2. So the code a rejected grant earns depends on which
// grant was used, and only the exchange collapses "your token is bad" into "your request is bad".
const REJECTED_GRANT_CODE_BY_GRANT_TYPE: Record<OauthGrantType, OauthTokenErrorCode> = {
  [OauthGrantType.AuthorizationCode]: OauthTokenErrorCode.InvalidGrant,
  [OauthGrantType.RefreshToken]: OauthTokenErrorCode.InvalidGrant,
  [OauthGrantType.TokenExchange]: OauthTokenErrorCode.InvalidRequest
};

// Translates whatever escaped the token endpoint into an RFC code. Sites where the class default is
// wrong throw `OauthTokenError` directly and pass through here untouched; the defaults below only have
// to cover the rest, so they key off the error class and never the message text.
//
// `UnauthorizedError` on this path always means a grant we will not act on (a bad authorization code,
// refresh token or subject token, or a subject we cannot resolve to a usable account), so it takes
// whichever code that grant owes. Client authentication is the exception and throws `invalid_client`
// explicitly, which RFC 8693 leaves to RFC 6749 because it is the client that failed, not the token.
//
// Anything that is neither is a bug or an outage rather than a bad request, so it becomes a generic
// `server_error`: its message was written for a different envelope and could carry internals.
export const toOauthTokenError = (error: unknown, grantType?: OauthGrantType): OauthTokenError => {
  if (error instanceof OauthTokenError) return error;

  if (error instanceof UnauthorizedError) {
    const code = grantType ? REJECTED_GRANT_CODE_BY_GRANT_TYPE[grantType] : OauthTokenErrorCode.InvalidGrant;

    return new OauthTokenError({ code, message: error.message, error });
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
