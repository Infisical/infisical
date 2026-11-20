import RE2 from "re2";

const URL_IGNORED_WHITESPACE = new RE2("[\\t\\n\\r]", "g");
const QUERY_OR_FRAGMENT = new RE2("[?#][\\s\\S]*$");
const TRAILING_WHITESPACE_OR_CONTROL = new RE2("[\\x00-\\x20]+$");
const PERCENT_ENCODED_BYTE = new RE2("%([0-9a-fA-F]{2})", "g");
const PERCENT_ENCODED_RUN = new RE2("(?:%[0-9a-fA-F]{2})+", "g");

const containsDotSegment = (path: string) =>
  PERCENT_ENCODED_BYTE.replace(path, (_match: string, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replaceAll("\\", "/")
    .split("/")
    .some((segment) => segment === "." || segment === "..");

// Rejects "." and ".." segments, including percent-encoded, backslash-separated and query- or fragment-ended forms.
export const hasHCVaultDotSegment = (path: string): boolean => {
  const withoutLineBreaks = URL_IGNORED_WHITESPACE.replace(path, "");
  const urlPath = TRAILING_WHITESPACE_OR_CONTROL.replace(QUERY_OR_FRAGMENT.replace(withoutLineBreaks, ""), "");

  return containsDotSegment(withoutLineBreaks) || containsDotSegment(urlPath);
};

const decodePercentEncodedRuns = (value: string) =>
  PERCENT_ENCODED_RUN.replace(value, (run: string) => {
    try {
      return decodeURIComponent(run);
    } catch {
      return run;
    }
  });

// True when the URL requests exactly the path written in it, with no query or fragment.
export const isHCVaultUrlPathPreserved = (url: string): boolean => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.search || parsed.hash) return false;

  const pathStart = url.indexOf("/", url.indexOf("://") + 3);
  if (pathStart === -1) return false;

  const writtenSegments = url.slice(pathStart).split("/");
  const requestedSegments = parsed.pathname.split("/");

  return (
    writtenSegments.length === requestedSegments.length &&
    writtenSegments.every(
      (segment, idx) => decodePercentEncodedRuns(segment) === decodePercentEncodedRuns(requestedSegments[idx])
    )
  );
};

export const HC_VAULT_URL_PATH_CHARACTERS_MESSAGE =
  "cannot contain '?', '#', '\\', tabs or line breaks, or end in whitespace";
