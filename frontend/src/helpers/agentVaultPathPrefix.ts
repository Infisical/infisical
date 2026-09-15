import { z } from "zod";

// Mirrors backend/src/ee/services/agent-vault/agent-vault-path-prefix.ts, which stays the grammar of record.
// Kept here so a bad prefix is caught before the request rather than coming back as a server error.

const PATH_PREFIX_RE = /^\/[A-Za-z0-9\-._~$&+,/:=@]*$/;

export const normalizePathPrefix = (value: string) => {
  const trimmed = value.trim();
  if (trimmed === "/") return trimmed;
  return trimmed.replace(/\/+$/, "");
};

/** `existing` must never contain the value being checked, so a duplicate is reported on the second one. */
export const pathPrefixError = (raw: string, existing: string[] = []): string | null => {
  const value = raw.trim();
  if (!value) return "A path prefix can't be empty.";
  if (value.length > 512) return "A path prefix can be at most 512 characters.";
  if (!value.startsWith("/")) return "A path prefix must start with a /.";
  if (value.includes("//")) return "A path prefix can't contain an empty segment.";
  if (value.split("/").some((segment) => segment === "." || segment === ".."))
    return "A path prefix can't contain a . or .. segment.";
  if (!PATH_PREFIX_RE.test(value))
    return "A path prefix can only contain letters, digits and - . _ ~ $ & + , : = @. Anything else is percent-encoded in the request URL, so a prefix carrying it would never match.";

  const normalized = normalizePathPrefix(value);
  if (existing.some((other) => normalizePathPrefix(other) === normalized))
    return `"${normalized}" is listed twice.`;

  return null;
};

/** One error slot per prefix. Each is judged against the prefixes before it, never against itself. */
const pathPrefixErrors = (prefixes: string[]): (string | null)[] =>
  prefixes.map((prefix, index) => pathPrefixError(prefix, prefixes.slice(0, index)));

export const addPathPrefixIssues = (
  prefixes: string[],
  ctx: z.RefinementCtx,
  path: (string | number)[] = []
) => {
  pathPrefixErrors(prefixes).forEach((message, index) => {
    if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: [...path, index] });
  });
};
