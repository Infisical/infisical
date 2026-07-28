import RE2 from "re2";

const PLACEHOLDER = "[REDACTED]";
const NO_URL = "NO_URL";
const RELATIVE_BASE = "http://relative.invalid";

const CREDENTIAL_PATH_HOSTS = new Set([
  "hooks.slack.com",
  "discord.com",
  "discordapp.com",
  "chat.googleapis.com",
  "hooks.zapier.com",
  "api.telegram.org",
  "maker.ifttt.com"
]);

const CREDENTIAL_PATH_HOST_SUFFIXES = [".webhook.office.com", ".logic.azure.com", ".slack.com"];

const hasScheme = new RE2(/^[a-z][a-z\d+\-.]*:\/\//i);
const trailingSlashes = new RE2(/\/+$/);
const leadingSlashes = new RE2(/^\/+/);

const MIN_TOKEN_LENGTH = 20;
const tokenCharset = new RE2(/^[A-Za-z0-9._~=+-]+$/);
const hasDigit = new RE2(/\d/);
const hasLetter = new RE2(/[A-Za-z]/);

const isCredentialPathHost = (hostname: string): boolean =>
  CREDENTIAL_PATH_HOSTS.has(hostname) || CREDENTIAL_PATH_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));

const isTokenLikeSegment = (segment: string): boolean =>
  segment.length >= MIN_TOKEN_LENGTH && tokenCharset.test(segment) && hasDigit.test(segment) && hasLetter.test(segment);

const redactPath = (pathname: string): string =>
  pathname
    .split("/")
    .map((segment) => (isTokenLikeSegment(segment) ? PLACEHOLDER : segment))
    .join("/");

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
 * Renders a URL safe to log: strips userinfo and fragment, redacts every query
 * value, and drops path segments that are credentials. Never returns the raw
 * input, so an unparseable URL is redacted rather than echoed.
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

  const hostname = url.hostname.toLowerCase();
  const path = isAbsolute && isCredentialPathHost(hostname) ? `/${PLACEHOLDER}` : redactPath(url.pathname);
  const origin = isAbsolute ? `${url.protocol}//${url.host}` : "";

  return `${origin}${path}${redactQuery(url.searchParams)}`;
};
