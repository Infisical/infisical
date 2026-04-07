import dns from "node:dns/promises";

import { isIPv4 } from "net";
import RE2 from "re2";

import { verifyHostInputValidity } from "@app/ee/services/dynamic-secret/dynamic-secret-fns";
import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";

import { BadRequestError } from "../errors";
import { isPrivateIp } from "../ip/ipRange";

export const blockLocalAndPrivateIpAddresses = async (url: string, isGateway = false) => {
  const appCfg = getConfig();

  if (appCfg.isDevelopmentMode || isGateway) return;

  const validUrl = new URL(url);

  if (validUrl.username || validUrl.password) {
    throw new BadRequestError({ message: "URLs with user credentials (e.g., user:pass@) are not allowed" });
  }

  const inputHostIps: string[] = [];
  if (isIPv4(validUrl.hostname)) {
    inputHostIps.push(validUrl.hostname);
  } else {
    if (validUrl.hostname === "localhost" || validUrl.hostname === "host.docker.internal") {
      throw new BadRequestError({ message: "Local IPs not allowed as URL" });
    }
    try {
      const resolvedIps = await dns.resolve4(validUrl.hostname);
      inputHostIps.push(...resolvedIps);
    } catch (err) {
      if ((err as { code: string })?.code !== "ENOTFOUND") throw err;

      const entries = await dns.lookup(validUrl.hostname, { all: true, family: 4 });

      if (!entries || entries.length === 0) {
        throw new BadRequestError({ message: "Could not resolve hostname to any IPv4 address" });
      }

      const resolvedIps = entries.map(({ address }) => address);

      inputHostIps.push(...resolvedIps);
    }
  }
  const isInternalIp = inputHostIps.some((el) => isPrivateIp(el));
  if (isInternalIp && !appCfg.ALLOW_INTERNAL_IP_CONNECTIONS)
    throw new BadRequestError({ message: "Local IPs not allowed as URL" });
};

type FQDNOptions = {
  require_tld?: boolean;
  allow_underscores?: boolean;
  allow_trailing_dot?: boolean;
  allow_numeric_tld?: boolean;
  allow_wildcard?: boolean;
  ignore_max_length?: boolean;
};

const defaultFqdnOptions: FQDNOptions = {
  require_tld: true,
  allow_underscores: false,
  allow_trailing_dot: false,
  allow_numeric_tld: false,
  allow_wildcard: false,
  ignore_max_length: false
};

// credits: https://github.com/validatorjs/validator.js/blob/f5da7fb6ed59b94695e6fcb2e970c80029509919/src/lib/isFQDN.js#L13
export const isFQDN = (str: string, options: FQDNOptions = {}): boolean => {
  if (typeof str !== "string") {
    throw new TypeError("Expected a string");
  }

  // Apply default options
  const opts: FQDNOptions = {
    ...defaultFqdnOptions,
    ...options
  };

  let testStr = str;
  /* Remove the optional trailing dot before checking validity */
  if (opts.allow_trailing_dot && str[str.length - 1] === ".") {
    testStr = testStr.substring(0, str.length - 1);
  }

  /* Remove the optional wildcard before checking validity */
  if (opts.allow_wildcard === true && str.indexOf("*.") === 0) {
    testStr = testStr.substring(2);
  }

  const parts = testStr.split(".");
  const tld = parts[parts.length - 1];

  if (opts.require_tld) {
    // disallow fqdns without tld
    if (parts.length < 2) {
      return false;
    }

    if (
      !opts.allow_numeric_tld &&
      !new RE2(/^([a-z\u00A1-\u00A8\u00AA-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]{2,}|xn[a-z0-9-]{2,})$/i).test(tld)
    ) {
      return false;
    }

    // disallow spaces
    if (new RE2(/\s/).test(tld)) {
      return false;
    }
  }

  // reject numeric TLDs
  if (!opts.allow_numeric_tld && new RE2(/^\d+$/).test(tld)) {
    return false;
  }

  const partRegex = new RE2(/^[a-z_\u00a1-\uffff0-9-]+$/i);
  const fullWidthRegex = new RE2(/[\uff01-\uff5e]/);
  const hyphenRegex = new RE2(/^-|-$/);
  const underscoreRegex = new RE2(/_/);

  return parts.every((part) => {
    if (part.length > 63 && !opts.ignore_max_length) {
      return false;
    }

    if (!partRegex.test(part)) {
      return false;
    }

    // disallow full-width chars
    if (fullWidthRegex.test(part)) {
      return false;
    }

    // disallow parts starting or ending with hyphen
    if (hyphenRegex.test(part)) {
      return false;
    }

    if (!opts.allow_underscores && underscoreRegex.test(part)) {
      return false;
    }

    return true;
  });
};

/**
 * Maximum number of redirects to follow when manually handling redirects
 */
const MAX_SAFE_REDIRECTS = 5;

type SsrfSafeRequestOptions = {
  allowPrivateIps?: boolean;
  validateStatus?: (status: number) => boolean;
};

/**
 * Validates a URL for SSRF protection.
 * Blocks:
 * - Local/private IPs (loopback, link-local, RFC 1918 addresses)
 * - Infisical's own infrastructure (DB, Redis, etc.)
 */
export const validateSsrfUrl = async (
  url: string,
  options?: Pick<SsrfSafeRequestOptions, "allowPrivateIps">
): Promise<void> => {
  if (options?.allowPrivateIps) {
    return;
  }

  const parsedUrl = new URL(url);

  // Block local/private IPs
  await blockLocalAndPrivateIpAddresses(url, false);

  // Also block Infisical's own infrastructure (DB, Redis, etc.)
  await verifyHostInputValidity({ host: parsedUrl.hostname, isGateway: false, isDynamicSecret: false });
};

/**
 * Makes an HTTP GET request with SSRF-safe redirect handling.
 * Disables automatic redirects and manually follows them while validating each hop.
 * This prevents redirect-based SSRF bypasses where the initial URL is valid but
 * redirects to an internal/private IP address.
 */
export const ssrfSafeGet = async <T>(
  url: string,
  options?: SsrfSafeRequestOptions
): Promise<{ data: T; status: number; headers: Record<string, unknown> }> => {
  let currentUrl = url;
  let redirectCount = 0;

  while (redirectCount <= MAX_SAFE_REDIRECTS) {
    // Validate URL before each request (including redirects)
    // eslint-disable-next-line no-await-in-loop
    await validateSsrfUrl(currentUrl, options);

    // eslint-disable-next-line no-await-in-loop
    const response = await request.get<T>(currentUrl, {
      maxRedirects: 0,
      validateStatus: options?.validateStatus ?? ((status) => status >= 200 && status < 400)
    });

    // Check if it's a redirect
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.location as string | undefined;
      if (!location) {
        throw new BadRequestError({
          message: `Redirect response (${response.status}) missing Location header`
        });
      }

      // Resolve relative redirects
      currentUrl = new URL(location, currentUrl).toString();
      redirectCount += 1;

      if (redirectCount > MAX_SAFE_REDIRECTS) {
        throw new BadRequestError({
          message: `Too many redirects (max ${MAX_SAFE_REDIRECTS})`
        });
      }
    } else {
      // Not a redirect, return the response
      return { data: response.data, status: response.status, headers: response.headers as Record<string, unknown> };
    }
  }

  throw new BadRequestError({
    message: `Too many redirects (max ${MAX_SAFE_REDIRECTS})`
  });
};

/**
 * Makes an HTTP POST request with SSRF protection.
 * Validates the URL before making the request and disables redirects.
 */
export const ssrfSafePost = async <T>(
  url: string,
  data: unknown,
  options?: Pick<SsrfSafeRequestOptions, "allowPrivateIps"> & { headers?: Record<string, string> }
): Promise<{ data: T }> => {
  await validateSsrfUrl(url, options);

  return request.post<T>(url, data, {
    headers: options?.headers,
    maxRedirects: 0
  });
};
