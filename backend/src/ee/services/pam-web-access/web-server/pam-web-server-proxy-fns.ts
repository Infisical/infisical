import type { IncomingHttpHeaders } from "node:http";

const FORWARDED_REQUEST_HEADERS = new Set([
  "accept",
  "accept-language",
  "cache-control",
  "content-type",
  "if-match",
  "if-modified-since",
  "if-none-match",
  "if-unmodified-since",
  "pragma",
  "range",
  "user-agent"
]);

export const buildBasicAuthorization = (user: string, password: string): string =>
  `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;

export const buildUpstreamRequestHeaders = ({
  requestHeaders,
  targetHost,
  authorization,
  upstreamCookie
}: {
  requestHeaders: IncomingHttpHeaders;
  targetHost: string;
  authorization: string;
  upstreamCookie?: string;
}): Record<string, string | string[]> => {
  const headers: Record<string, string | string[]> = {};

  Object.entries(requestHeaders).forEach(([key, value]) => {
    if (!FORWARDED_REQUEST_HEADERS.has(key) || value === undefined) return;
    headers[key] = value;
  });

  headers.host = targetHost;
  headers.authorization = authorization;
  if (upstreamCookie) headers.cookie = upstreamCookie;

  return headers;
};

export const updateCookieJar = (cookieJar: Map<string, string>, setCookieHeaders?: string[]): void => {
  setCookieHeaders?.forEach((header) => {
    const [cookiePair, ...attributes] = header.split(";");
    const separatorIndex = cookiePair.indexOf("=");
    if (separatorIndex <= 0) return;

    const name = cookiePair.slice(0, separatorIndex).trim();
    const value = cookiePair.slice(separatorIndex + 1).trim();
    const shouldDelete = value === "" || attributes.some((attribute) => attribute.trim().toLowerCase() === "max-age=0");

    if (shouldDelete) {
      cookieJar.delete(name);
      return;
    }
    cookieJar.set(name, value);
  });
};

export const serializeCookieJar = (cookieJar: Map<string, string>): string =>
  [...cookieJar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");

export const rewriteLocationForProxy = ({
  location,
  targetOrigin,
  proxyBasePath
}: {
  location: string;
  targetOrigin: string;
  proxyBasePath: string;
}): string | null => {
  const resolved = new URL(location, targetOrigin);
  if (resolved.origin !== targetOrigin) return null;
  return `${proxyBasePath}${resolved.pathname}${resolved.search}${resolved.hash}`;
};

export const rewriteHtmlForProxy = (html: string, proxyBasePath: string): string =>
  html.replace(/\b(href|src|action)=(['"])\/(?!\/)/gi, `$1=$2${proxyBasePath}/`);
