import crypto from "node:crypto";

import * as oauth from "oauth4webapi";
import RE2 from "re2";

import { BadRequestError } from "@app/lib/errors";
import { logger, sanitizeUrlForLog } from "@app/lib/logger";
import { PRIVATE_ADDRESS_REFUSED_MESSAGE } from "@app/lib/validator";
import { computePkceChallenge } from "@app/services/oauth-client/oauth-client-fns";
import { OauthGrantType } from "@app/services/oauth-client/oauth-client-types";

import { AgentVaultCredentialType, AgentVaultOauthStatus } from "../agent-vault/agent-vault-enums";
import {
  describeServer,
  MAX_OAUTH_SCOPES,
  OFFLINE_ACCESS_SCOPE,
  splitScopes,
  stripTrailingSlash
} from "./agent-vault-oauth-discovery-fns";
import { TOauthHttpClient, withTimeout } from "./agent-vault-oauth-http-fns";
import {
  AGENT_VAULT_OAUTH_HEADER_NAME,
  AGENT_VAULT_OAUTH_HEADER_PREFIX,
  AgentVaultOauthClientAuthMethod,
  AgentVaultOauthCompatibility,
  TAgentVaultOauthConfig,
  TResolvedOauthCredential
} from "./agent-vault-oauth-types";

const base64Url = (buffer: Buffer) => buffer.toString("base64url");

export const hashAccessToken = (accessToken: string) => crypto.createHash("sha256").update(accessToken).digest("hex");

export const generatePkce = () => {
  const codeVerifier = base64Url(crypto.randomBytes(32));
  const codeChallenge = computePkceChallenge(codeVerifier);
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
  // OIDC Core section 11: a server must ignore offline_access without it, and issue no refresh token.
  if (scopes.includes(OFFLINE_ACCESS_SCOPE)) url.searchParams.set("prompt", "consent");
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

// RFC 6749 appendix A: client IDs, client secrets and tokens are all VSCHAR. The access token is injected into a
// header by the proxy, so a line break or NUL in it must never get that far; the client ID is stored in jsonb and
// sent in the authorize URL, and the secret is form-encoded into the token request, which throws on a lone surrogate.
export const OAUTH_VSCHAR_PATTERN = new RE2(/^[\x20-\x7e]+$/);

const MAX_TOKEN_LENGTH = 16_384;
const isUsableToken = (value: unknown): value is string =>
  typeof value === "string" && value.length <= MAX_TOKEN_LENGTH && OAUTH_VSCHAR_PATTERN.test(value);

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

// A reauthorize asks for at most the 100 discovered scopes plus 100 an agent reported, so no real server grants more.
// Granted scopes go into the pending authorization in Redis and are asked for again on every reauthorize.
export const MAX_GRANTED_OAUTH_SCOPES = 2 * MAX_OAUTH_SCOPES;

const PROOF_OF_POSSESSION_TOKEN_TYPES = new Set(["dpop", "mac", "pop"]);

export const parseTokenResponse = (
  body: Record<string, unknown>,
  requestedScopes: string[] = []
): TOauthTokens | null => {
  const accessToken = body.access_token;
  if (!isUsableToken(accessToken)) return null;
  // RFC 6749 section 7.1 lets a server name its own token types, and some name bearer tokens differently (Slack
  // sends "user"). Only proof-of-possession tokens are refused, since they need proof the proxy can't give.
  if (typeof body.token_type === "string" && PROOF_OF_POSSESSION_TOKEN_TYPES.has(body.token_type.toLowerCase())) {
    return null;
  }

  const refreshToken = isUsableToken(body.refresh_token) ? body.refresh_token : undefined;
  // Slack's user-token response puts the granted scopes under authed_user rather than at the top level.
  const authedUser = body.authed_user;
  const scope =
    typeof body.scope !== "string" && authedUser && typeof authedUser === "object"
      ? (authedUser as Record<string, unknown>).scope
      : body.scope;
  const { scopes, commaSeparated } = parseGrantedScopes(scope, requestedScopes);
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
const FORM_URL_ESCAPED_RE = new RE2(/[-_.!~*'()]|%20/g);

// The encoding oauth4webapi applies to the client ID and secret in a client_secret_basic header, which escapes
// more characters than URLSearchParams does.
export const formUrlEncode = (value: string) =>
  encodeURIComponent(value).replace(FORM_URL_ESCAPED_RE, (match) =>
    match === "%20" ? "+" : `%${match.charCodeAt(0).toString(16).toUpperCase()}`
  );

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
  // truncating, so a partial secret is never left at the cut. The request body is encoded by URLSearchParams and
  // the Basic header by `formUrlEncode`, so both forms are redacted.
  let redacted = text;
  sensitiveValues
    .filter((value): value is string => Boolean(value))
    .forEach((value) => {
      const encodings = [new URLSearchParams({ value }).toString().slice("value=".length), formUrlEncode(value)];
      const secrets = new Set([value, ...encodings.flatMap((encoded) => [encoded, encoded.replaceAll("+", "%20")])]);
      secrets.forEach((secret) => {
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

export const requestToken = async ({
  http,
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
  // The login server can live elsewhere than the MCP server (Supabase, Stripe, GitHub), so name the host the admin
  // needs to check.
  const host = describeServer(tokenEndpoint);
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
  const requestSecrets = [
    ...sensitiveValues,
    clientSecret,
    params.code,
    params.code_verifier,
    params.refresh_token,
    ...(clientSecret
      ? [Buffer.from(`${formUrlEncode(clientId)}:${formUrlEncode(clientSecret)}`).toString("base64")]
      : [])
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
    } catch (err) {
      // Only the message: the error itself carries the request config, client secret and Basic header included.
      const reason = normalizeProviderText(
        err instanceof Error ? err.message : String(err),
        MAX_ERROR_DESCRIPTION_LENGTH,
        requestSecrets
      );
      logger.info(
        `agentVaultOauth: token request failed [tokenEndpoint=${sanitizeUrlForLog(tokenEndpoint)}] [reason=${reason}]`
      );
      const isPrivateAddress = err instanceof BadRequestError && err.message === PRIVATE_ADDRESS_REFUSED_MESSAGE;
      return {
        ok: false,
        errorCode: null,
        message: isPrivateAddress
          ? `Infisical can't reach the login server '${host}' because it's on a private network. Use a bearer token for this service instead.`
          : `Couldn't reach the login server '${host}'.`,
        resourceDropped: !withResource
      };
    }

    const body = parseTokenBody(response.headers.get("content-type") ?? "", await response.text());
    // GitHub answers a failed exchange with a 200 and an `error` field.
    if (response.status >= 200 && response.status < 300 && body && body.error === undefined) {
      const tokens = parseTokenResponse(body, requestedScopes);
      const grantedCount = tokens?.scopes?.length ?? 0;
      if (grantedCount > MAX_GRANTED_OAUTH_SCOPES) {
        return {
          ok: false,
          errorCode: null,
          message: `The login server '${host}' granted ${grantedCount} OAuth scopes, more than the ${MAX_GRANTED_OAUTH_SCOPES} Infisical supports.`,
          resourceDropped: !withResource
        };
      }
      if (tokens) return { ok: true, tokens, resourceDropped: !withResource };
      return {
        ok: false,
        errorCode: null,
        message: `The login server '${host}' returned a token Infisical can't use (it must be printable text that works as a bearer token).`,
        resourceDropped: !withResource
      };
    }

    // Redacted before the cut, since a secret split by truncation would no longer match.
    const errorCode = normalizeProviderText(body?.error, MAX_ERROR_CODE_LENGTH, requestSecrets) || null;
    const description = normalizeProviderText(body?.error_description, MAX_ERROR_DESCRIPTION_LENGTH, requestSecrets);
    const detail = description || errorCode;
    // A bare 5xx is an outage, not a refusal, and the refresh keeps retrying it.
    const message =
      !detail && response.status >= 500
        ? `The login server '${host}' is having trouble right now (HTTP ${response.status}).`
        : `The login server '${host}' refused the token request: ${detail || `HTTP ${response.status}`}`;
    return { ok: false, errorCode, message, resourceDropped: !withResource };
  };

  const result = await send(true);
  if (!result.ok && result.errorCode === "invalid_target" && resource && deadline - Date.now() >= MIN_RETRY_BUDGET_MS) {
    return send(false);
  }
  return result;
};

// Refresh errors that mean the login is gone for good, so retrying on every poll only repeats the refusal. The
// client codes mean the server dropped the registered client (the MCP SDK starts over on invalid_client too) or no
// longer accepts its secret; the rest are providers' own names for a dead refresh token.
const DEAD_LOGIN_ERROR_CODES = new Set([
  "invalid_grant",
  "invalid_client",
  "unauthorized_client",
  "incorrect_client_credentials", // GitHub's invalid_client, sent with a 200
  "bad_refresh_token", // GitHub
  "invalid_refresh_token", // Slack
  "token_revoked", // Slack
  "token_expired", // Slack
  "bad_client_secret", // Slack's invalid_client
  "invalid_client_id" // Slack's invalid_client
]);

export const isDeadLoginError = (errorCode: string | null) =>
  errorCode !== null && DEAD_LOGIN_ERROR_CODES.has(errorCode);

export const exchangeAuthorizationCode = (
  args: Omit<Parameters<typeof requestToken>[0], "params"> & { code: string; codeVerifier: string; redirectUri: string }
) =>
  requestToken({
    ...args,
    params: {
      grant_type: OauthGrantType.AuthorizationCode,
      code: args.code,
      code_verifier: args.codeVerifier,
      redirect_uri: args.redirectUri
    }
  });

export const refreshAccessToken = (
  args: Omit<Parameters<typeof requestToken>[0], "params"> & { refreshToken: string }
) => requestToken({ ...args, params: { grant_type: OauthGrantType.RefreshToken, refresh_token: args.refreshToken } });

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

// Sent in the bearer shape so a proxy that predates OAuth injects it unchanged; `source` is what tells a newer one
// it may ask for a refresh. Both the session poll and the refresh endpoint build it here, so the two can't drift.
export const toResolvedOauthCredential = (
  config: Pick<TAgentVaultOauthConfig, "expiresAt">,
  accessToken: string
): TResolvedOauthCredential => ({
  type: AgentVaultCredentialType.Bearer,
  headerName: AGENT_VAULT_OAUTH_HEADER_NAME,
  headerPrefix: AGENT_VAULT_OAUTH_HEADER_PREFIX,
  value: accessToken,
  source: AgentVaultCredentialType.OAuth,
  expiresAt: config.expiresAt ?? null
});

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
