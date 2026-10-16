import crypto from "node:crypto";

import * as oauth from "oauth4webapi";
import RE2 from "re2";

import { sanitizeUrlForLog } from "@app/lib/logger";

import { AgentVaultOauthStatus } from "../agent-vault/agent-vault-enums";
import { describeServer, splitScopes, stripTrailingSlash } from "./agent-vault-oauth-discovery-fns";
import { TOauthHttpClient } from "./agent-vault-oauth-http-fns";
import { AgentVaultOauthClientAuthMethod, AgentVaultOauthCompatibility } from "./agent-vault-oauth-types";

const base64Url = (buffer: Buffer) => buffer.toString("base64url");

export const hashAccessToken = (accessToken: string) => crypto.createHash("sha256").update(accessToken).digest("hex");

export const generatePkce = () => {
  const codeVerifier = base64Url(crypto.randomBytes(32));
  const codeChallenge = base64Url(crypto.createHash("sha256").update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
};

// The part before the first `.` is the authorization id, so the callback page can find the authorization
// without a lookup. The whole value is still compared in constant time.
export const generateState = (authorizationId: string) => `${authorizationId}.${base64Url(crypto.randomBytes(32))}`;

export const isSameState = (expected: string, received: string) => {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export const buildAuthorizeUrl = ({
  authorizationEndpoint,
  clientId,
  redirectUri,
  codeChallenge,
  state,
  resource,
  scopes
}: {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
  resource: string | null;
  scopes: string[];
}) => {
  const url = new URL(authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  if (resource) url.searchParams.set("resource", resource);
  if (scopes.length) url.searchParams.set("scope", scopes.join(" "));
  return url.toString();
};

// RFC 9207 section 2.4, as the MCP spec applies it: an `iss` that arrives must match, and one that a server
// advertises must arrive. A server that never mentions it is trusted on the code alone.
export const validateCallbackIssuer = ({
  iss,
  expectedIssuer,
  issParameterSupported,
  serverUrl
}: {
  iss?: string;
  expectedIssuer: string;
  issParameterSupported: boolean;
  serverUrl: string;
}): string | null => {
  const host = describeServer(serverUrl);
  if (iss === undefined || iss === "") {
    return issParameterSupported
      ? `The authorization response from '${host}' didn't say which server issued it, though that server promises to. Authorize again.`
      : null;
  }
  if (stripTrailingSlash(iss) !== stripTrailingSlash(expectedIssuer)) {
    return `The authorization response came from a different server than '${host}' uses, so it was rejected. Authorize again.`;
  }
  return null;
};

export type TOauthTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scopes?: string[];
  // True when `scopes` came from the comma-separated fallback rather than RFC 6749's space-separated list.
  scopesCommaSeparated?: boolean;
};

export type TTokenRequestResult =
  | { ok: true; tokens: TOauthTokens; resourceDropped: boolean }
  | { ok: false; errorCode: string | null; message: string; resourceDropped: boolean };

const parseTokenBody = (contentType: string, body: string): Record<string, unknown> | null => {
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(body));
  }
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // Some servers send form encoding labelled as something else.
    if (body.includes("=")) return Object.fromEntries(new URLSearchParams(body));
  }
  return null;
};

const MAX_TOKEN_LENGTH = 16_384;
// RFC 6749 appendix A.12 and A.17: tokens are VSCHAR. The access token is injected into a header by the proxy, so a
// line break or NUL in it must never get that far.
const TOKEN_PATTERN = new RE2(/^[\x20-\x7e]+$/);
const isUsableToken = (value: unknown): value is string =>
  typeof value === "string" && value.length <= MAX_TOKEN_LENGTH && TOKEN_PATTERN.test(value);

// One year. A longer lifetime is treated as none given, so the token is refreshed only when the upstream rejects
// it, which is what a server meaning "doesn't expire" wants. Clamping instead would mark a token that has no
// refresh token as expired after a year while it still works.
export const MAX_EXPIRES_IN_SECONDS = 365 * 24 * 60 * 60;

export const parseExpiresIn = (value: unknown): number | undefined => {
  const seconds = typeof value === "string" && value.trim() ? Number(value) : value;
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return undefined;
  const whole = Math.floor(seconds);
  return whole >= 1 && whole <= MAX_EXPIRES_IN_SECONDS ? whole : undefined;
};

// RFC 6749 section 3.3 separates scopes with spaces, and a comma is legal inside a scope token. Some servers
// (GitHub) join them with commas instead, so a value with no spaces is split on commas only when every part is a
// scope that was asked for and the whole value isn't.
export const parseGrantedScopes = (
  scope: unknown,
  requestedScopes: string[] = []
): { scopes?: string[]; commaSeparated: boolean } => {
  if (typeof scope !== "string") return { commaSeparated: false };
  if (!scope.includes(" ") && scope.includes(",") && !requestedScopes.includes(scope)) {
    const parts = scope.split(",").filter(Boolean);
    if (parts.length > 1 && parts.every((part) => requestedScopes.includes(part))) {
      return { scopes: splitScopes(scope, ","), commaSeparated: true };
    }
  }
  return { scopes: splitScopes(scope), commaSeparated: false };
};

export const parseTokenResponse = (
  body: Record<string, unknown>,
  requestedScopes: string[] = []
): TOauthTokens | null => {
  const accessToken = body.access_token;
  if (!isUsableToken(accessToken)) return null;
  // Only bearer tokens can be injected as a header; DPoP and MAC tokens need proof the proxy can't give.
  if (typeof body.token_type === "string" && body.token_type.toLowerCase() !== "bearer") return null;

  const refreshToken = isUsableToken(body.refresh_token) ? body.refresh_token : undefined;
  const { scopes, commaSeparated } = parseGrantedScopes(body.scope, requestedScopes);
  return {
    accessToken,
    refreshToken,
    expiresIn: parseExpiresIn(body.expires_in),
    scopes,
    ...(commaSeparated ? { scopesCommaSeparated: true } : {})
  };
};

const MAX_PROVIDER_TEXT_LENGTH = 500;
export const MAX_ERROR_CODE_LENGTH = 100;
export const MAX_ERROR_DESCRIPTION_LENGTH = 300;
// RE2's \s omits Unicode whitespace and vertical tabs.
// eslint-disable-next-line no-control-regex
const PROVIDER_WHITESPACE_RE = new RE2(/[\s\p{Z}\ufeff\x00-\x1f\x7f]+/gu);
const PROVIDER_FORMATTING_RE = new RE2(/[\p{Cc}\p{Cf}\p{Co}]/gu);
const REPEATED_SPACES_RE = new RE2(/ {2,}/g);
const PROVIDER_URL_RE = new RE2(/https?:\/\/[^\s\v\p{Z}\ufeff<>"']+/giu);

// Anything a provider sends that can end up in a message, a log line, `lastError` or an authorization's `error`
// goes through here: line breaks and tabs become spaces, other control and formatting characters (NUL, lone
// surrogates and bidi overrides included) are dropped, since jsonb can't hold the first two, and it is cut to a
// readable length.
export const normalizeProviderText = (
  text: unknown,
  maxLength = MAX_PROVIDER_TEXT_LENGTH,
  sensitiveValues: (string | undefined)[] = []
) => {
  if (typeof text !== "string" || !text) return "";
  // Providers can echo request credentials in their descriptions. Redact literal and form-encoded values before
  // truncating, so a partial secret is never left at the cut.
  let redacted = text;
  sensitiveValues
    .filter((value): value is string => Boolean(value))
    .forEach((value) => {
      const encoded = new URLSearchParams({ value }).toString().slice("value=".length);
      [...new Set([value, encoded, encoded.replaceAll("+", "%20")])].forEach((secret) => {
        redacted = redacted.split(secret).join("[redacted]");
      });
    });
  // RE2 turns lone surrogates into replacement characters before matching; drop them while still in UTF-16.
  const wellFormed = [...redacted]
    .filter((character) => {
      const codePoint = character.codePointAt(0)!;
      return codePoint < 0xd800 || codePoint > 0xdfff;
    })
    .join("");
  const normalized = wellFormed
    .replace(PROVIDER_WHITESPACE_RE, " ")
    .replace(PROVIDER_FORMATTING_RE, "")
    .replace(REPEATED_SPACES_RE, " ")
    .replace(PROVIDER_URL_RE, (url) => sanitizeUrlForLog(url))
    .trim();
  return [...normalized].slice(0, maxLength).join("");
};

// One deadline for the request and its invalid_target retry together: the proxy's credential refresh has to answer
// inside its own 15 second timeout, lock wait and database reads included.
export const TOKEN_REQUEST_BUDGET_MS = 7_000;
const MIN_RETRY_BUDGET_MS = 500;

// Also bounds what the HTTP client's own timeout doesn't cover, such as resolving and validating the host.
const withTimeout = <T>(promise: Promise<T>, ms: number) => {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Token request timed out")), ms);
    })
  ]).finally(() => clearTimeout(timer));
};

export const requestToken = async ({
  http,
  serverUrl,
  issuer,
  tokenEndpoint,
  params,
  clientId,
  clientSecret,
  tokenEndpointAuthMethod,
  resource,
  requestedScopes = [],
  sensitiveValues = [],
  budgetMs = TOKEN_REQUEST_BUDGET_MS
}: {
  http: TOauthHttpClient;
  serverUrl: string;
  issuer: string;
  tokenEndpoint: string;
  params: Record<string, string>;
  clientId: string;
  clientSecret?: string;
  tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod;
  resource: string | null;
  // What the grant asked for, which decides whether a comma-joined `scope` is split.
  requestedScopes?: string[];
  sensitiveValues?: string[];
  budgetMs?: number;
}): Promise<TTokenRequestResult> => {
  const host = describeServer(serverUrl);
  const deadline = Date.now() + budgetMs;
  const authorizationServer = { issuer, token_endpoint: tokenEndpoint };
  const client = { client_id: clientId };
  let clientAuthentication = oauth.None();
  if (clientSecret && tokenEndpointAuthMethod === AgentVaultOauthClientAuthMethod.ClientSecretBasic) {
    clientAuthentication = oauth.ClientSecretBasic(clientSecret);
  }
  if (clientSecret && tokenEndpointAuthMethod === AgentVaultOauthClientAuthMethod.ClientSecretPost) {
    clientAuthentication = oauth.ClientSecretPost(clientSecret);
  }
  const encodedClientId = new URLSearchParams({ value: clientId }).toString().slice("value=".length);
  const encodedClientSecret = new URLSearchParams({ value: clientSecret ?? "" }).toString().slice("value=".length);
  const requestSecrets = [
    ...sensitiveValues,
    clientSecret,
    params.code,
    params.code_verifier,
    params.refresh_token,
    ...(clientSecret ? [Buffer.from(`${encodedClientId}:${encodedClientSecret}`).toString("base64")] : [])
  ];

  const send = async (withResource: boolean): Promise<TTokenRequestResult> => {
    const form = new URLSearchParams(params);
    if (withResource && resource) form.set("resource", resource);

    let response;
    try {
      const remainingMs = Math.max(1, deadline - Date.now());
      response = await withTimeout(
        oauth.genericTokenEndpointRequest(authorizationServer, client, clientAuthentication, params.grant_type, form, {
          // All egress stays on the SSRF-safe client, including DNS pinning and redirect restrictions.
          [oauth.customFetch]: async (url, options) => {
            const result = await http.postForm(url, options.body, options.headers, {
              timeoutMs: Math.max(1, deadline - Date.now())
            });
            return new Response(result.body || null, {
              status: result.status,
              headers: { "Content-Type": result.contentType }
            });
          }
        }),
        remainingMs
      );
    } catch {
      return {
        ok: false,
        errorCode: null,
        message: `Couldn't reach the token endpoint of '${host}'. Try again in a moment.`,
        resourceDropped: !withResource
      };
    }

    const body = parseTokenBody(response.headers.get("content-type") ?? "", await response.text());
    // GitHub answers a failed exchange with a 200 and an `error` field.
    if (response.status >= 200 && response.status < 300 && body && body.error === undefined) {
      const tokens = parseTokenResponse(body, requestedScopes);
      if (tokens) return { ok: true, tokens, resourceDropped: !withResource };
      return {
        ok: false,
        errorCode: null,
        message: `'${host}' returned a token Infisical can't use (it must be a bearer token of printable characters).`,
        resourceDropped: !withResource
      };
    }

    const errorCode = normalizeProviderText(body?.error, MAX_ERROR_CODE_LENGTH) || null;
    const description = normalizeProviderText(body?.error_description, MAX_ERROR_DESCRIPTION_LENGTH, requestSecrets);
    const detail =
      description ||
      normalizeProviderText(errorCode, MAX_ERROR_CODE_LENGTH, requestSecrets) ||
      `HTTP ${response.status}`;
    return {
      ok: false,
      errorCode,
      message: `'${host}' refused the token request: ${detail}`,
      resourceDropped: !withResource
    };
  };

  const result = await send(true);
  if (!result.ok && result.errorCode === "invalid_target" && resource && deadline - Date.now() >= MIN_RETRY_BUDGET_MS) {
    return send(false);
  }
  return result;
};

export const exchangeAuthorizationCode = (
  args: Omit<Parameters<typeof requestToken>[0], "params"> & { code: string; codeVerifier: string; redirectUri: string }
) =>
  requestToken({
    ...args,
    params: {
      grant_type: "authorization_code",
      code: args.code,
      code_verifier: args.codeVerifier,
      redirect_uri: args.redirectUri
    }
  });

export const refreshAccessToken = (
  args: Omit<Parameters<typeof requestToken>[0], "params"> & { refreshToken: string }
) => requestToken({ ...args, params: { grant_type: "refresh_token", refresh_token: args.refreshToken } });

export const withTokenCompatibility = (
  compatibility: AgentVaultOauthCompatibility[],
  { resourceDropped, scopesCommaSeparated }: { resourceDropped: boolean; scopesCommaSeparated?: boolean }
): AgentVaultOauthCompatibility[] => {
  const used = [
    ...(resourceDropped ? [AgentVaultOauthCompatibility.ResourceRejected] : []),
    ...(scopesCommaSeparated ? [AgentVaultOauthCompatibility.ScopeCommaSeparated] : [])
  ].filter((entry) => !compatibility.includes(entry));
  return used.length ? [...compatibility, ...used] : compatibility;
};

// Never throws: `parseExpiresIn` bounds what a provider sends, and anything that still isn't a date is no expiry.
export const expiresAtFrom = (expiresIn: number | undefined, now: Date) => {
  if (expiresIn === undefined) return null;
  const expiresAt = new Date(now.getTime() + expiresIn * 1000);
  return Number.isNaN(expiresAt.getTime()) ? null : expiresAt.toISOString();
};

export type TRefreshDecision =
  | { action: "return-current" }
  | { action: "refresh" }
  | { action: "needs-reauthorization"; reason: string };

// One decision for both callers. Resolve passes `expiresWithinSeconds`; the proxy, after a 401, passes the hash
// of the token it sent.
export const decideRefresh = ({
  status,
  expiresAt,
  accessTokenHash,
  hasRefreshToken,
  rejectedTokenHash,
  expiresWithinSeconds,
  now
}: {
  status: AgentVaultOauthStatus;
  expiresAt: string | null;
  accessTokenHash: string;
  hasRefreshToken: boolean;
  rejectedTokenHash?: string;
  expiresWithinSeconds?: number;
  now: Date;
}): TRefreshDecision => {
  if (status === AgentVaultOauthStatus.NeedsReauthorization) return { action: "return-current" };

  if (rejectedTokenHash !== undefined) {
    // Someone else already replaced the rejected token, so the current one is the answer.
    if (rejectedTokenHash !== accessTokenHash) return { action: "return-current" };
    if (!hasRefreshToken) {
      return {
        action: "needs-reauthorization",
        reason: "The MCP server rejected the access token and issued no refresh token. Reauthorize this service."
      };
    }
    return { action: "refresh" };
  }

  // Without an expiry the token is refreshed only when the upstream rejects it.
  if (!expiresAt || expiresWithinSeconds === undefined) return { action: "return-current" };
  const expiresAtMs = new Date(expiresAt).getTime();
  if (expiresAtMs > now.getTime() + expiresWithinSeconds * 1000) return { action: "return-current" };
  if (!hasRefreshToken) {
    return expiresAtMs <= now.getTime()
      ? {
          action: "needs-reauthorization",
          reason: "The access token expired and the MCP server issued no refresh token. Reauthorize this service."
        }
      : { action: "return-current" };
  }
  return { action: "refresh" };
};
