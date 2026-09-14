import { z } from "zod";

// Mirrors backend/src/ee/services/agent-vault/agent-vault-path-prefix.ts, which stays the grammar of record.
// Kept here so a bad prefix is caught before the request rather than coming back as a server error.

const PATH_PREFIX_RE = /^\/[^\s?#%;\\]*$/;

export const normalizePathPrefix = (value: string) => {
  const trimmed = value.trim();
  if (trimmed === "/") return trimmed;
  return trimmed.replace(/\/+$/, "");
};

export const pathPrefixError = (raw: string): string | null => {
  const value = raw.trim();
  if (!value) return "A path prefix can't be empty.";
  if (value.length > 512) return "A path prefix can be at most 512 characters.";
  if (!value.startsWith("/")) return "A path prefix must start with a /.";
  if (value.includes("//")) return "A path prefix can't contain an empty segment.";
  if (value.split("/").some((segment) => segment === "." || segment === ".."))
    return "A path prefix can't contain a . or .. segment.";
  if (!PATH_PREFIX_RE.test(value))
    return "A path prefix can't contain a space, %, ;, \\, ? or #. Write the path exactly as it appears in the URL.";
  return null;
};

export const addPathPrefixIssues = (
  prefixes: { value: string }[],
  ctx: z.RefinementCtx,
  path: (string | number)[] = []
) => {
  const seen = new Set<string>();
  prefixes.forEach((prefix, index) => {
    const message = pathPrefixError(prefix.value);
    if (message) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: [...path, index, "value"] });
      return;
    }
    const normalized = normalizePathPrefix(prefix.value);
    if (seen.has(normalized)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `"${normalized}" is listed twice.`,
        path: [...path, index, "value"]
      });
    }
    seen.add(normalized);
  });
};
