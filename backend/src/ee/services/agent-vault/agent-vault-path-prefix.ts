import RE2 from "re2";
import { z } from "zod";

export const AGENT_VAULT_MAX_PATH_PREFIX_LENGTH = 512;
export const AGENT_VAULT_MAX_PATH_PREFIXES = 20;

// An allowlist, because a prefix is compared against the escaped path and only these survive that encoding:
// `/café` would be judged against `/caf%C3%A9` and could never match. '%' is left out so the comparison stays
// exact, ';' and '\' because servers disagree about them, '?' and '#' because both end the path. ',' survives
// encoding and would match, but the UI commits a chip on it, so it cannot be typed and is refused here too.
const PATH_PREFIX_RE = new RE2(/^\/[A-Za-z0-9\-._~$&+/:=@]*$/);

const hasTraversalSegment = (value: string) => value.split("/").some((segment) => segment === "." || segment === "..");

// '/' keeps its trailing slash: stripping it would leave an empty string, which means nothing.
export const normalizePathPrefix = (value: string) => {
  const trimmed = value.trim();
  if (trimmed === "/") return trimmed;
  return trimmed.replace(/\/+$/, "");
};

const pathPrefixError = (raw: string) => {
  const value = raw.trim();
  if (!value) return "A path prefix can't be empty.";
  if (value.length > AGENT_VAULT_MAX_PATH_PREFIX_LENGTH)
    return `"${value.slice(0, 40)}…" is longer than ${AGENT_VAULT_MAX_PATH_PREFIX_LENGTH} characters.`;
  if (!value.startsWith("/")) return `"${value}" must start with a /.`;
  if (value.includes("//")) return `"${value}" can't contain an empty path segment.`;
  if (hasTraversalSegment(value)) return `"${value}" can't contain a . or .. segment.`;
  if (!PATH_PREFIX_RE.test(value))
    return `"${value}" can only contain letters, digits and - . _ ~ $ & + : = @.`;
  return null;
};

// No `.max()`: pathPrefixError measures the length itself, and Zod's check would fire alongside it.
export const pathPrefixSchema = z
  .string()
  .trim()
  .superRefine((raw, ctx) => {
    const message = pathPrefixError(raw);
    if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  })
  .transform(normalizePathPrefix);

// NULL is the only "every path", so the proxy never has two representations to treat alike. `.nullable()`
// without `.optional()`, so a PATCH omitting the field leaves the column alone and an explicit null clears it.
export const agentVaultPathPrefixListSchema = z
  .array(pathPrefixSchema)
  .min(1, "Add at least one path prefix, or leave this unset to allow every path.")
  .max(AGENT_VAULT_MAX_PATH_PREFIXES)
  .superRefine((prefixes, ctx) => {
    const seen = new Set<string>();
    prefixes.forEach((prefix, index) => {
      if (seen.has(prefix)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `"${prefix}" is listed twice.`, path: [index] });
      }
      seen.add(prefix);
    });
  })
  .nullable();
