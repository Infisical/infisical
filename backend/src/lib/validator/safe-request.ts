import { LookupAddress } from "node:dns";
import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { LookupFunction } from "node:net";

import { AxiosRequestConfig } from "axios";
import { isIP } from "net";

import { verifyHostInputValidity } from "@app/ee/services/dynamic-secret/dynamic-secret-fns";
import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { logger } from "@app/lib/logger";

import { BadRequestError } from "../errors";
import { isPrivateIp } from "../ip/ipRange";

const formatEntries = (entries: LookupAddress[]) => entries.map((e) => `${e.family}:${e.address}`).join(",");

export type TValidatedHost = {
  hostname: string;
  entries: LookupAddress[];
};

type SafeRequestSharedOptions = {
  allowPrivateIps?: boolean;
};

// Validates the URL and resolves its IPs in a single DNS lookup. Returning the
// resolved entries lets the caller pin the connection to the same IPs that
// passed validation, closing the rebinding window between validate and connect.
export const validateAndPinUrl = async (
  url: string,
  options?: SafeRequestSharedOptions
): Promise<TValidatedHost | undefined> => {
  const appCfg = getConfig();

  if (options?.allowPrivateIps) return undefined;
  if (appCfg.isDevelopmentMode) return undefined;

  const validUrl = new URL(url);

  if (validUrl.username || validUrl.password) {
    logger.warn(`safeRequest: rejecting URL with embedded credentials [hostname=${validUrl.hostname}]`);
    throw new BadRequestError({ message: "URLs with user credentials (e.g., user:pass@) are not allowed" });
  }

  // `new URL()` preserves both IPv6 brackets (e.g. "[::1]") and trailing
  // FQDN dots (e.g. "localhost."). Strip both so isIP / dns.lookup / the
  // literal-hostname check all see a clean form.
  let rawHost = validUrl.hostname;
  if (rawHost.startsWith("[") && rawHost.endsWith("]")) {
    rawHost = rawHost.slice(1, -1);
  }
  if (rawHost.endsWith(".")) {
    rawHost = rawHost.slice(0, -1);
  }

  let entries: LookupAddress[];
  if (isIP(rawHost)) {
    entries = [{ address: rawHost, family: isIP(rawHost) }];
  } else {
    if (rawHost === "localhost" || rawHost === "host.docker.internal") {
      logger.warn(`safeRequest: rejecting literal local hostname [hostname=${rawHost}]`);
      throw new BadRequestError({ message: "Local IPs not allowed as URL" });
    }
    const lookups = await dns.lookup(rawHost, { all: true });

    if (!lookups || lookups.length === 0) {
      logger.warn(`safeRequest: DNS returned no addresses [hostname=${rawHost}]`);
      throw new BadRequestError({ message: "Could not resolve hostname to any IP address" });
    }
    entries = lookups;
  }

  const isInternalIp = entries.some((e) => isPrivateIp(e.address));
  if (isInternalIp && !appCfg.ALLOW_INTERNAL_IP_CONNECTIONS) {
    logger.warn(`safeRequest: rejecting private/internal IP [hostname=${rawHost}] [entries=${formatEntries(entries)}]`);
    throw new BadRequestError({ message: "Local IPs not allowed as URL" });
  }

  // Block Infisical's own infrastructure (DB, Redis, etc.).
  await verifyHostInputValidity({
    host: rawHost,
    isGateway: false,
    isDynamicSecret: false,
    preResolvedIps: entries.map((e) => e.address)
  });

  logger.debug(`safeRequest: validated and pinned [hostname=${rawHost}] [entries=${formatEntries(entries)}]`);

  return { hostname: rawHost, entries };
};

type TLookupOneCallback = (err: NodeJS.ErrnoException | null, address: string, family: number) => void;
type TLookupAllCallback = (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void;

const notFoundError = (hostname: string): NodeJS.ErrnoException => {
  const err = new Error(`getaddrinfo ENOTFOUND ${hostname}`) as NodeJS.ErrnoException & { hostname?: string };
  err.code = "ENOTFOUND";
  err.errno = -3008;
  err.syscall = "getaddrinfo";
  err.hostname = hostname;
  return err;
};

// v4-first ordering so Happy Eyeballs races a healthy v4 path before falling
// through to v6 after autoSelectFamilyAttemptTimeout.
const sortV4First = (entries: LookupAddress[]): LookupAddress[] => entries.slice().sort((a, b) => a.family - b.family);

const pickPreferredEntry = (entries: LookupAddress[]): LookupAddress =>
  entries.find((e) => e.family === 4) ?? entries[0];

// dns.lookup-shaped function that always returns the pre-validated IPs.
// Installed on an http(s).Agent so connect-time DNS cannot land on a different
// IP than the one validation approved.
const makePinnedLookup = (entries: LookupAddress[]): LookupFunction =>
  ((hostname: string, optionsOrCb: unknown, maybeCb?: unknown) => {
    if (typeof optionsOrCb === "function") {
      const first = pickPreferredEntry(entries);
      (optionsOrCb as TLookupOneCallback)(null, first.address, first.family);
      return;
    }
    const opts = (optionsOrCb ?? {}) as { all?: boolean; family?: number };

    // Fail with ENOTFOUND when a specific family is requested but unavailable,
    // rather than silently returning a different family — some endpoints only
    // work on the requested one.
    if (opts.family) {
      const filtered = entries.filter((e) => e.family === opts.family);
      if (filtered.length === 0) {
        (maybeCb as TLookupOneCallback | TLookupAllCallback)(notFoundError(hostname), null as never, 0 as never);
        return;
      }
      if (opts.all) {
        (maybeCb as TLookupAllCallback)(null, filtered);
      } else {
        const first: LookupAddress = filtered[0];
        (maybeCb as TLookupOneCallback)(null, first.address, first.family);
      }
      return;
    }

    if (opts.all) {
      (maybeCb as TLookupAllCallback)(null, sortV4First(entries));
    } else {
      const first = pickPreferredEntry(entries);
      (maybeCb as TLookupOneCallback)(null, first.address, first.family);
    }
  }) as LookupFunction;

type TBuildAgentOptions = {
  addressFamily?: 4 | 6;
  ca?: string | string[];
  rejectUnauthorized?: boolean;
  servername?: string;
  keepAlive?: boolean;
  checkServerIdentity?: https.AgentOptions["checkServerIdentity"];
};

const hasAgentCustomization = (opts: TBuildAgentOptions): boolean =>
  Boolean(opts.addressFamily) ||
  opts.rejectUnauthorized !== undefined ||
  opts.ca !== undefined ||
  opts.servername !== undefined ||
  opts.keepAlive !== undefined ||
  opts.checkServerIdentity !== undefined;

// Pool of agents keyed by connection signature for connection reuse across
// repeated calls. The cache key includes the validated IP set so DNS record
// changes naturally produce a fresh entry. The hard cap is cleared wholesale
// when exceeded — misses just rebuild.
const AGENT_CACHE_MAX = 200;
const agentCache = new Map<string, http.Agent | https.Agent>();

const buildAgentCacheKey = (
  validated: TValidatedHost | undefined,
  protocol: string,
  opts: TBuildAgentOptions
): string => {
  const ipSet = validated
    ? validated.entries
        .map((e) => `${e.family}:${e.address}`)
        .sort()
        .join(",")
    : "";
  const caKey = Array.isArray(opts.ca) ? opts.ca.join("|") : (opts.ca ?? "");
  return [
    protocol,
    validated?.hostname ?? "",
    ipSet,
    opts.addressFamily ?? "",
    opts.keepAlive ?? "",
    opts.rejectUnauthorized ?? "",
    opts.servername ?? "",
    caKey
  ].join("|");
};

const constructAgent = (
  validated: TValidatedHost | undefined,
  protocol: string,
  opts: TBuildAgentOptions
): http.Agent | https.Agent => {
  const isHttps = protocol === "https:";
  const lookup = validated ? makePinnedLookup(validated.entries) : undefined;
  // Default keepAlive: true so cached agents reuse connections.
  const baseOpts: http.AgentOptions = {
    keepAlive: opts.keepAlive ?? true,
    keepAliveMsecs: 1000,
    maxSockets: 50,
    maxFreeSockets: 10,
    family: opts.addressFamily,
    lookup,
    // Happy Eyeballs: race v4 and v6 so a healthy family wins regardless of
    // resolver / lookup ordering. 250ms is Node's default.
    autoSelectFamily: true,
    autoSelectFamilyAttemptTimeout: 250
  };

  if (isHttps) {
    const httpsOpts: https.AgentOptions = {
      ...baseOpts,
      ...(opts.ca !== undefined && { ca: opts.ca }),
      ...(opts.rejectUnauthorized !== undefined && { rejectUnauthorized: opts.rejectUnauthorized }),
      ...(opts.servername !== undefined && { servername: opts.servername }),
      ...(opts.checkServerIdentity !== undefined && { checkServerIdentity: opts.checkServerIdentity })
    };
    return new https.Agent(httpsOpts);
  }
  return new http.Agent(baseOpts);
};

const buildPinnedAgent = (
  validated: TValidatedHost | undefined,
  protocol: string,
  opts: TBuildAgentOptions = {}
): http.Agent | https.Agent | undefined => {
  // Nothing to pin and no other customization — fall through to Axios's
  // default agent.
  if (!validated && !hasAgentCustomization(opts)) return undefined;

  // Function-valued options can't be fingerprinted; bypass the cache.
  if (opts.checkServerIdentity) {
    return constructAgent(validated, protocol, opts);
  }

  const cacheKey = buildAgentCacheKey(validated, protocol, opts);
  const cached = agentCache.get(cacheKey);
  if (cached) {
    logger.debug(`safeRequest: pinned agent cache hit [hostname=${validated?.hostname ?? "n/a"}]`);
    return cached;
  }

  if (agentCache.size >= AGENT_CACHE_MAX) {
    logger.info(`safeRequest: pinned agent cache full, clearing [size=${agentCache.size}]`);
    agentCache.clear();
  }

  const agent = constructAgent(validated, protocol, opts);
  agentCache.set(cacheKey, agent);
  logger.debug(
    `safeRequest: pinned agent cache miss, built new agent [hostname=${validated?.hostname ?? "n/a"}] [cacheSize=${agentCache.size}]`
  );
  return agent;
};

type TBuildSsrfSafeAgentOptions = {
  allowPrivateIps?: boolean;
  addressFamily?: 4 | 6;
  ca?: string | string[];
  rejectUnauthorized?: boolean;
  servername?: string;
  keepAlive?: boolean;
  checkServerIdentity?: https.AgentOptions["checkServerIdentity"];
};

// Builds an SSRF-safe http(s).Agent for a URL, pinning DNS to the validated
// IPs and forwarding ca / rejectUnauthorized / servername to TLS. Use when
// handing an agent to a third-party client that doesn't go through Axios;
// safeRequest handles the Axios case directly.
export const buildSsrfSafeAgent = async (
  url: string,
  options: TBuildSsrfSafeAgentOptions = {}
): Promise<http.Agent | https.Agent | undefined> => {
  const { allowPrivateIps, addressFamily, ca, rejectUnauthorized, servername, keepAlive, checkServerIdentity } =
    options;
  const validated = await validateAndPinUrl(url, { allowPrivateIps });
  const { protocol } = new URL(url);
  return buildPinnedAgent(validated, protocol, {
    addressFamily,
    ca,
    rejectUnauthorized,
    servername,
    keepAlive,
    checkServerIdentity
  });
};

type TSafeRequestExtras = {
  allowPrivateIps?: boolean;
  addressFamily?: 4 | 6;
  ca?: string | string[];
  rejectUnauthorized?: boolean;
  servername?: string;
};

type TSafeRequestConfig = Omit<AxiosRequestConfig, "httpAgent" | "httpsAgent" | "maxRedirects" | "url" | "method">;

type TSafeRequestFullConfig = Omit<AxiosRequestConfig, "httpAgent" | "httpsAgent" | "maxRedirects"> & {
  url: string;
} & TSafeRequestExtras;

// Mirrors Axios's path-preserving slash join so the URL we validate matches
// the URL Axios actually requests. `new URL(url, base)` would replace the
// base path instead.
const combineURLs = (baseURL: string, relativeURL: string): string => {
  if (!relativeURL) return baseURL.replace(/\/+$/, "");
  return `${baseURL.replace(/\/+$/, "")}/${relativeURL.replace(/^\/+/, "")}`;
};

const isAbsoluteURL = (url: string): boolean => /^([a-z][a-z\d+\-.]*:)?\/\//i.test(url);

const resolveBaseUrl = (url: string, baseURL?: string): string => {
  if (!baseURL || isAbsoluteURL(url)) return url;
  return combineURLs(baseURL, url);
};

const logDispatch = (method: string, effectiveUrl: string, validated: TValidatedHost | undefined) => {
  const pinned = validated ? formatEntries(validated.entries) : "none";
  logger.debug(`safeRequest: dispatching [method=${method}] [url=${effectiveUrl}] [pinned=${pinned}]`);
};

const dispatch = async <T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  data: unknown,
  options: TSafeRequestConfig & TSafeRequestExtras = {}
) => {
  const { allowPrivateIps, addressFamily, ca, rejectUnauthorized, servername, ...axiosOpts } = options;
  const appCfg = getConfig();
  const effectiveUrl = resolveBaseUrl(url, axiosOpts.baseURL);
  const validated = await validateAndPinUrl(effectiveUrl, { allowPrivateIps });
  const { protocol } = new URL(effectiveUrl);
  const agent = buildPinnedAgent(validated, protocol, { addressFamily, ca, rejectUnauthorized, servername });
  logDispatch(method, effectiveUrl, validated);

  return request.request<T>({
    ...axiosOpts,
    method,
    url,
    ...(data !== undefined && { data }),
    maxRedirects: 0,
    // Force direct egress so an ambient HTTP(S)_PROXY can't route around the
    // pinned agent (the proxy would re-resolve the target, defeating the pin).
    ...(appCfg.SAFE_REQUEST_FORCE_DIRECT_EGRESS && { proxy: false as const }),
    httpAgent: protocol === "http:" ? (agent as http.Agent | undefined) : undefined,
    httpsAgent: protocol === "https:" ? (agent as https.Agent | undefined) : undefined
  });
};

const dispatchFull = async <T>(config: TSafeRequestFullConfig) => {
  const { allowPrivateIps, addressFamily, ca, rejectUnauthorized, servername, url, ...axiosOpts } = config;
  const appCfg = getConfig();
  const effectiveUrl = resolveBaseUrl(url, axiosOpts.baseURL);
  const validated = await validateAndPinUrl(effectiveUrl, { allowPrivateIps });
  const { protocol } = new URL(effectiveUrl);
  const agent = buildPinnedAgent(validated, protocol, { addressFamily, ca, rejectUnauthorized, servername });
  logDispatch(axiosOpts.method ?? "GET", effectiveUrl, validated);

  return request.request<T>({
    ...axiosOpts,
    url,
    maxRedirects: 0,
    // Force direct egress so an ambient HTTP(S)_PROXY can't route around the
    // pinned agent (the proxy would re-resolve the target, defeating the pin).
    ...(appCfg.SAFE_REQUEST_FORCE_DIRECT_EGRESS && { proxy: false as const }),
    httpAgent: protocol === "http:" ? (agent as http.Agent | undefined) : undefined,
    httpsAgent: protocol === "https:" ? (agent as https.Agent | undefined) : undefined
  });
};

// HTTP client that validates the URL, pins the connection to the validated
// IPs, and disables redirects. `T` defaults to `any` to mirror Axios's
// `request.get` / `request.post` defaults.
export const safeRequest = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get: <T = any>(url: string, options?: TSafeRequestConfig & TSafeRequestExtras) =>
    dispatch<T>("GET", url, undefined, options),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  post: <T = any>(url: string, data: unknown, options?: TSafeRequestConfig & TSafeRequestExtras) =>
    dispatch<T>("POST", url, data, options),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  put: <T = any>(url: string, data: unknown, options?: TSafeRequestConfig & TSafeRequestExtras) =>
    dispatch<T>("PUT", url, data, options),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  patch: <T = any>(url: string, data: unknown, options?: TSafeRequestConfig & TSafeRequestExtras) =>
    dispatch<T>("PATCH", url, data, options),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete: <T = any>(url: string, options?: TSafeRequestConfig & TSafeRequestExtras) =>
    dispatch<T>("DELETE", url, undefined, options),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  request: <T = any>(config: TSafeRequestFullConfig) => dispatchFull<T>(config)
};
