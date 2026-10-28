import RE2 from "re2";

import { BadRequestError } from "@app/lib/errors";
import { logger, sanitizeUrlForLog } from "@app/lib/logger";
import { PRIVATE_ADDRESS_REFUSED_MESSAGE } from "@app/lib/validator";

import { TOauthHttpClient, TOauthHttpResponse } from "./agent-vault-oauth-http-fns";
import { AgentVaultOauthCompatibility } from "./agent-vault-oauth-types";

export const OFFLINE_ACCESS_SCOPE = "offline_access";
// The spec sets no limit. Slack, the largest real server found, lists 30; this only stops a buggy or hostile
// server from making every authorization store and send an enormous scope list.
export const MAX_OAUTH_SCOPES = 100;
// Each request has its own 10 second timeout, so without an overall budget a server that hangs could hold the
// request past a 60 second gateway.
const DISCOVERY_BUDGET_MS = 25_000;

export type TOauthDiscovery = {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint: string | null;
  // True when the endpoints were guessed at the origin, so a failed registration means "enter a client" rather
  // than "the server is broken".
  endpointsGuessed: boolean;
  resource: string;
  scopes: string[];
  issParameterSupported: boolean;
  tokenEndpointAuthMethodsSupported: string[] | null;
  grantTypesSupported: string[] | null;
  compatibility: AgentVaultOauthCompatibility[];
  // False when the server answered but sent no Bearer challenge and serves no OAuth metadata, which usually
  // means the URL is wrong. Old servers can still work with an admin-entered client, so it only warns.
  oauthAdvertised: boolean;
};

export const describeServer = (serverUrl: string) => {
  try {
    return new URL(serverUrl).host;
  } catch {
    return "the MCP server";
  }
};

export const oauthSetupError = (serverUrl: string, problem: string) =>
  new BadRequestError({ message: `Couldn't set up OAuth for '${describeServer(serverUrl)}': ${problem}` });

// Printable ASCII only, as RFC 3986 requires: these URLs are stored in jsonb as sent, and the URL parser would
// accept a NUL or a lone surrogate that the jsonb write then fails on.
const URL_PATTERN = new RE2(/^[\x21-\x7e]+$/);
const TRAILING_SLASH_RE = new RE2(/\/+$/);
// RE2's \s is ASCII-only; include the Unicode whitespace accepted by the existing parser.
const BEARER_CHALLENGE_RE = new RE2(/(^|[\s\v\p{Z}\ufeff,])Bearer([\s\v\p{Z}\ufeff]|$)/iu);
const BEARER_PREFIX_RE = new RE2(/^[\s\v\p{Z}\ufeff,]*Bearer[\s\v\p{Z}\ufeff]*/iu);
const CHALLENGE_SEPARATOR_RE = new RE2(/[\s\v\p{Z}\ufeff,]/u);
const QUOTED_ESCAPE_RE = new RE2(/\\(.)/g);

const isHttpsUrl = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length > 2048 || !URL_PATTERN.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !value.includes("#");
  } catch {
    return false;
  }
};

export const stripTrailingSlash = (value: string) => value.replace(TRAILING_SLASH_RE, "");

// RFC 6750 section 3 auth-params of the Bearer challenge. Quoted strings may hold commas and escaped quotes.
export const parseBearerChallenge = (header: string | null): Record<string, string> | null => {
  if (!header) return null;
  const start = header.search(BEARER_CHALLENGE_RE);
  if (start === -1) return null;
  const rest = header.slice(start).replace(BEARER_PREFIX_RE, "");

  const params: Record<string, string> = {};
  const paramRe = new RE2(
    /([A-Za-z0-9_-]+)[\s\v\p{Z}\ufeff]*=[\s\v\p{Z}\ufeff]*(?:"((?:[^"\\]|\\.)*)"|([^\s\v\p{Z}\ufeff,"]+))/uy
  );
  let index = 0;
  while (index < rest.length) {
    while (index < rest.length && CHALLENGE_SEPARATOR_RE.test(rest[index])) index += 1;
    if (index >= rest.length) break;
    paramRe.lastIndex = index;
    const match = paramRe.exec(rest);
    // Anything else is the next challenge's scheme, which ends this one.
    if (!match) break;
    const [, key, quoted, token] = match;
    params[key.toLowerCase()] = quoted !== undefined ? quoted.replace(QUOTED_ESCAPE_RE, "$1") : token;
    index = paramRe.lastIndex;
  }
  return params;
};

export const MAX_OAUTH_SCOPE_LENGTH = 256;
// RFC 6749 section 3.3 scope-token. Scopes are joined with spaces into the scope parameter and stored in jsonb, so
// whitespace, quotes, backslashes and control characters (NUL included) would corrupt one or the other.
export const OAUTH_SCOPE_TOKEN_PATTERN = new RE2(/^[\x21\x23-\x5b\x5d-\x7e]+$/);

export const isOauthScopeToken = (scope: unknown): scope is string =>
  typeof scope === "string" && scope.length <= MAX_OAUTH_SCOPE_LENGTH && OAUTH_SCOPE_TOKEN_PATTERN.test(scope);

export const splitScopes = (scope: unknown, delimiter: RE2 | string = " "): string[] =>
  typeof scope === "string" ? [...new Set(scope.split(delimiter).filter(isOauthScopeToken))] : [];

const parseJsonObject = (response: TOauthHttpResponse): Record<string, unknown> | null => {
  if (response.status !== 200) return null;
  try {
    const parsed: unknown = JSON.parse(response.body);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

// `temporary` separates an outage (no answer, 429 or 5xx) from metadata the server doesn't have.
type TFetchedJson = { answered: boolean; temporary: boolean; json: Record<string, unknown> | null };

const fetchJson = async (http: TOauthHttpClient, url: string): Promise<TFetchedJson> => {
  try {
    const response = await http.get(url);
    return {
      answered: true,
      temporary: response.status === 429 || response.status >= 500,
      json: parseJsonObject(response)
    };
  } catch {
    logger.info(`agentVaultOauth: metadata fetch failed [url=${sanitizeUrlForLog(url)}]`);
    return { answered: false, temporary: true, json: null };
  }
};

// The requests are already running together; this takes the first usable answer in priority order as soon as every
// URL ahead of it has answered, so a slow URL lower down never holds up a preferred one that already did.
const firstUsableInOrder = async <T>(pending: Promise<T>[], usable: (value: T) => boolean): Promise<T | null> => {
  // eslint-disable-next-line no-restricted-syntax
  for (const promise of pending) {
    // eslint-disable-next-line no-await-in-loop
    const value = await promise;
    if (usable(value)) return value;
  }
  return null;
};

// RFC 9728 section 3.1: the well-known segment goes between the host and the path.
export const protectedResourceMetadataUrls = (serverUrl: string, challengeUrl?: string): string[] => {
  const url = new URL(serverUrl);
  const path = url.pathname === "/" ? "" : url.pathname;
  return [
    ...(challengeUrl && isHttpsUrl(challengeUrl) ? [challengeUrl] : []),
    ...(path ? [`${url.origin}/.well-known/oauth-protected-resource${path}`] : []),
    `${url.origin}/.well-known/oauth-protected-resource`
  ];
};

// The order the MCP authorization spec gives for an issuer with and without a path.
export const authorizationServerMetadataUrls = (issuer: string): string[] => {
  const url = new URL(issuer);
  const path = stripTrailingSlash(url.pathname);
  if (!path) {
    return [`${url.origin}/.well-known/oauth-authorization-server`, `${url.origin}/.well-known/openid-configuration`];
  }
  return [
    `${url.origin}/.well-known/oauth-authorization-server${path}`,
    `${url.origin}/.well-known/openid-configuration${path}`,
    `${url.origin}${path}/.well-known/openid-configuration`
  ];
};

// The resource a token is bound to has to cover the server we broker. A prefix on the same origin covers it
// (a server at /mcp/v2 protected as /mcp); another origin never does.
export const checkProtectedResource = (
  serverUrl: string,
  resource: unknown
): { resource: string; compatibility: AgentVaultOauthCompatibility | null } => {
  if (resource === undefined || resource === null) {
    return { resource: serverUrl, compatibility: AgentVaultOauthCompatibility.ResourceMissing };
  }
  if (!isHttpsUrl(resource)) {
    throw oauthSetupError(serverUrl, "its protected resource metadata names a resource that isn't an https URL.");
  }

  const server = new URL(serverUrl);
  const advertised = new URL(resource);
  if (advertised.origin !== server.origin) {
    throw oauthSetupError(
      serverUrl,
      `its protected resource metadata is for '${advertised.host}', a different server. Check the server URL.`
    );
  }

  const serverPath = stripTrailingSlash(server.pathname);
  const resourcePath = stripTrailingSlash(advertised.pathname);
  if (serverPath === resourcePath) return { resource, compatibility: null };
  if (!resourcePath || serverPath.startsWith(`${resourcePath}/`)) {
    return { resource, compatibility: AgentVaultOauthCompatibility.ResourcePrefix };
  }
  throw oauthSetupError(
    serverUrl,
    "its protected resource metadata is for a path that doesn't cover this server URL. Check the server URL."
  );
};

// RFC 8414 section 3.3: an issuer that differs from the one the metadata was fetched for is a mix-up attack.
// A trailing slash is the one difference accepted, since servers disagree on it.
export const checkIssuer = (
  serverUrl: string,
  expected: string,
  advertised: unknown
): AgentVaultOauthCompatibility | null => {
  if (advertised === expected) return null;
  if (typeof advertised === "string" && stripTrailingSlash(advertised) === stripTrailingSlash(expected)) {
    return AgentVaultOauthCompatibility.IssuerTrailingSlash;
  }
  throw oauthSetupError(
    serverUrl,
    "its authorization server metadata names a different issuer than the one it was fetched from, so it can't be trusted."
  );
};

export const selectScopes = ({
  challengeScope,
  scopesSupported,
  authorizationServerScopes
}: {
  challengeScope?: string;
  scopesSupported?: unknown;
  authorizationServerScopes?: unknown;
}): string[] => {
  let scopes = splitScopes(challengeScope);
  if (!scopes.length && Array.isArray(scopesSupported)) {
    scopes = scopesSupported.filter(isOauthScopeToken);
  }
  const offline =
    Array.isArray(authorizationServerScopes) && authorizationServerScopes.includes(OFFLINE_ACCESS_SCOPE)
      ? [OFFLINE_ACCESS_SCOPE]
      : [];
  return [...new Set([...scopes, ...offline])];
};

const discover = async (http: TOauthHttpClient, serverUrl: string): Promise<TOauthDiscovery> => {
  const compatibility = new Set<AgentVaultOauthCompatibility>();
  let answered = false;
  let isPrivateAddress = false;

  // The probe and the well-known locations are asked at once; the challenge only says where to look first, and its
  // URL is asked as soon as the probe answers rather than after the well-known ones.
  const fetches = new Map<string, Promise<TFetchedJson>>(
    protectedResourceMetadataUrls(serverUrl).map((url) => [url, fetchJson(http, url)])
  );
  const challenge = await http.probe(serverUrl).then(
    (response) => {
      answered = true;
      return parseBearerChallenge(response.wwwAuthenticate);
    },
    (err: unknown) => {
      isPrivateAddress = err instanceof BadRequestError && err.message === PRIVATE_ADDRESS_REFUSED_MESSAGE;
      logger.info(`agentVaultOauth: MCP server probe failed [server=${describeServer(serverUrl)}]`);
      return null;
    }
  );
  const orderedUrls = protectedResourceMetadataUrls(serverUrl, challenge?.resource_metadata);
  orderedUrls.forEach((url) => {
    if (!fetches.has(url)) fetches.set(url, fetchJson(http, url));
  });

  const protectedResource =
    (
      await firstUsableInOrder(
        orderedUrls.map((url) => fetches.get(url)!),
        (result) => Boolean(result.json && Array.isArray(result.json.authorization_servers))
      )
    )?.json ?? null;
  // Waits on every URL only when none had usable metadata, and by then they have all settled anyway.
  if (protectedResource) answered = true;
  else if (!answered) answered = (await Promise.all(fetches.values())).some((result) => result.answered);

  if (!answered) {
    throw new BadRequestError({
      message: isPrivateAddress
        ? `Infisical can't reach '${describeServer(serverUrl)}' because it's on a private network. Use a bearer token for this service instead.`
        : `Couldn't reach '${describeServer(serverUrl)}'. Check the server URL and that the server is online.`
    });
  }

  let resource = serverUrl;
  let issuer = new URL(serverUrl).origin;
  if (protectedResource) {
    const checked = checkProtectedResource(serverUrl, protectedResource.resource);
    resource = checked.resource;
    if (checked.compatibility) compatibility.add(checked.compatibility);

    const [firstServer] = protectedResource.authorization_servers as unknown[];
    if (!isHttpsUrl(firstServer)) {
      throw oauthSetupError(serverUrl, "its protected resource metadata names no https authorization server.");
    }
    issuer = firstServer;
  } else {
    // The 2025-03-26 spec behavior: the MCP server's origin is its own authorization server.
    compatibility.add(AgentVaultOauthCompatibility.NoProtectedResourceMetadata);
  }

  const metadataFetches = authorizationServerMetadataUrls(issuer).map((url) => fetchJson(http, url));
  const metadata = (await firstUsableInOrder(metadataFetches, (result) => Boolean(result.json)))?.json ?? null;
  // Guessed endpoints are for servers without metadata; during an outage they would send sign-in to the wrong URL.
  if (!metadata && (await Promise.all(metadataFetches)).every((result) => result.temporary)) {
    throw new BadRequestError({
      message: `Couldn't reach the authorization server '${describeServer(issuer)}'. Try again in a few minutes.`
    });
  }

  const scopes = selectScopes({
    challengeScope: challenge?.scope,
    scopesSupported: protectedResource?.scopes_supported,
    authorizationServerScopes: metadata?.scopes_supported
  });
  if (scopes.length > MAX_OAUTH_SCOPES) {
    throw oauthSetupError(
      serverUrl,
      `it asks for ${scopes.length} OAuth scopes, more than the ${MAX_OAUTH_SCOPES} Infisical supports.`
    );
  }
  const oauthAdvertised = Boolean(challenge || protectedResource || metadata);

  if (!metadata) {
    compatibility.add(AgentVaultOauthCompatibility.NoAuthorizationServerMetadata);
    compatibility.add(AgentVaultOauthCompatibility.PkceUnadvertised);
    const { origin } = new URL(issuer);
    return {
      issuer,
      authorizationEndpoint: `${origin}/authorize`,
      tokenEndpoint: `${origin}/token`,
      registrationEndpoint: `${origin}/register`,
      endpointsGuessed: true,
      resource,
      scopes,
      issParameterSupported: false,
      tokenEndpointAuthMethodsSupported: null,
      grantTypesSupported: null,
      compatibility: [...compatibility],
      oauthAdvertised
    };
  }

  const issuerCompatibility = checkIssuer(serverUrl, issuer, metadata.issuer);
  if (issuerCompatibility) compatibility.add(issuerCompatibility);

  const authorizationEndpoint = metadata.authorization_endpoint;
  const tokenEndpoint = metadata.token_endpoint;
  const registrationEndpoint = metadata.registration_endpoint;
  if (!isHttpsUrl(authorizationEndpoint) || !isHttpsUrl(tokenEndpoint)) {
    throw oauthSetupError(
      serverUrl,
      "its authorization server metadata needs https authorization and token endpoints without usernames, passwords or fragments. Ask the MCP server administrator to correct its OAuth metadata."
    );
  }

  const challengeMethods = metadata.code_challenge_methods_supported;
  if (Array.isArray(challengeMethods)) {
    if (!challengeMethods.includes("S256")) {
      throw oauthSetupError(
        serverUrl,
        "its authorization server doesn't support PKCE with S256, which the MCP authorization spec requires."
      );
    }
  } else {
    compatibility.add(AgentVaultOauthCompatibility.PkceUnadvertised);
  }

  const authMethods = metadata.token_endpoint_auth_methods_supported;
  const grantTypes = metadata.grant_types_supported;
  return {
    issuer,
    authorizationEndpoint,
    tokenEndpoint,
    registrationEndpoint: isHttpsUrl(registrationEndpoint) ? registrationEndpoint : null,
    endpointsGuessed: false,
    resource,
    scopes,
    issParameterSupported: metadata.authorization_response_iss_parameter_supported === true,
    tokenEndpointAuthMethodsSupported: Array.isArray(authMethods)
      ? authMethods.filter((method): method is string => typeof method === "string")
      : null,
    grantTypesSupported: Array.isArray(grantTypes)
      ? grantTypes.filter((grantType): grantType is string => typeof grantType === "string")
      : null,
    compatibility: [...compatibility],
    oauthAdvertised
  };
};

export const discoverOauthServer = async (
  http: TOauthHttpClient,
  serverUrl: string,
  budgetMs = DISCOVERY_BUDGET_MS
): Promise<TOauthDiscovery> => {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      logger.info(`agentVaultOauth: discovery timed out [server=${describeServer(serverUrl)}]`);
      reject(
        oauthSetupError(serverUrl, "it took too long to respond. Check that the server is online, then try again.")
      );
    }, budgetMs);
  });
  try {
    return await Promise.race([discover(http, serverUrl), deadline]);
  } finally {
    clearTimeout(timer);
  }
};
