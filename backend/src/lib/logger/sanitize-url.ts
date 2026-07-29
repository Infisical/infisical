import RE2 from "re2";

const PLACEHOLDER = "[REDACTED]";
const NO_URL = "NO_URL";
const RELATIVE_BASE = "http://relative.invalid";

const hasScheme = new RE2(/^[a-z][a-z\d+\-.]*:\/\//i);
const trailingSlashes = new RE2(/\/+$/);
const leadingSlashes = new RE2(/^\/+/);

const redactQuery = (searchParams: URLSearchParams): string => {
  const keys = [...searchParams.keys()];
  if (!keys.length) return "";
  return `?${keys.map((key) => `${key}=${PLACEHOLDER}`).join("&")}`;
};

const resolveUrl = (rawUrl?: string, baseUrl?: string): string => {
  if (!rawUrl) return baseUrl ?? "";
  if (!baseUrl || hasScheme.test(rawUrl)) return rawUrl;
  return `${baseUrl.replace(trailingSlashes, "")}/${rawUrl.replace(leadingSlashes, "")}`;
};

/**
 * Renders a URL safe to log: keeps only the origin, strips userinfo and the
 * fragment, redacts the whole path, and redacts every query value. Credentials
 * in a URL path cannot be recognised reliably, so the path is always dropped
 * rather than inspected. Never returns the raw input, so an unparseable URL is
 * redacted rather than echoed.
 */
export const sanitizeUrlForLog = (rawUrl?: string, baseUrl?: string): string => {
  const target = resolveUrl(rawUrl, baseUrl);
  if (!target) return NO_URL;

  const isAbsolute = hasScheme.test(target);

  let url: URL;
  try {
    url = new URL(target, isAbsolute ? undefined : RELATIVE_BASE);
  } catch {
    return PLACEHOLDER;
  }

  const path = url.pathname === "/" ? url.pathname : `/${PLACEHOLDER}`;
  const origin = isAbsolute ? `${url.protocol}//${url.host}` : "";

  return `${origin}${path}${redactQuery(url.searchParams)}`;
};
