import RE2 from "re2";

const URL_IGNORED_WHITESPACE = new RE2("[\\t\\n\\r]", "g");
const PERCENT_ENCODED_BYTE = new RE2("%([0-9a-fA-F]{2})", "g");

// Rejects "." and ".." segments, including percent-encoded and backslash-separated forms.
export const hasHCVaultDotSegment = (path: string): boolean => {
  const decoded = PERCENT_ENCODED_BYTE.replace(
    URL_IGNORED_WHITESPACE.replace(path, ""),
    (_match: string, hex: string) => String.fromCharCode(parseInt(hex, 16))
  );

  return decoded
    .replaceAll("\\", "/")
    .split("/")
    .some((segment) => segment === "." || segment === "..");
};
