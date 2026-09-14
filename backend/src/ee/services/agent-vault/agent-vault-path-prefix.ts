import RE2 from "re2";
import { z } from "zod";

// The grammar is mirrored in the CLI (packages/agentvault/policy.go), which does the matching at runtime.
// A change to the rules here needs the same change there.
//
// A prefix is compared against the request's escaped path, byte for byte, and never against a decoded one.
// `agent-vault-host-pattern.ts` rejects paths in a host pattern because the matcher would compare the
// decoded path while the upstream receives the escaped one; that objection still stands, and this filter
// sidesteps it by not decoding. What makes that safe is the second half of the rule, in the proxy: a
// path-restricted service refuses outright any request whose path would have to be normalised to judge.
// So the filter never allows a path whose meaning depends on the upstream's decoder.

export const AGENT_VAULT_MAX_PATH_PREFIX_LENGTH = 512;
export const AGENT_VAULT_MAX_PATH_PREFIXES = 20;

// '%' is excluded so the byte comparison against the escaped request path is exact. ';' and '\' are
// excluded because servers disagree about them: Tomcat and Jetty strip `;params` per segment, IIS reads
// '\' as '/'. '?' and '#' end the path, so neither can appear in one.
const PATH_PREFIX_RE = new RE2(/^\/[^\s?#%;\\]*$/);

const hasTraversalSegment = (value: string) => value.split("/").some((segment) => segment === "." || segment === "..");

// '/' is the one prefix that keeps its trailing slash: stripping it would leave an empty string, which
// violates the grammar and would no longer mean "every path".
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
    return `"${value}" can't contain a space, %, ;, \\, ? or #. Write the path exactly as it appears in the URL.`;
  return null;
};

export const pathPrefixSchema = z
  .string()
  .trim()
  .max(AGENT_VAULT_MAX_PATH_PREFIX_LENGTH)
  .superRefine((raw, ctx) => {
    const message = pathPrefixError(raw);
    if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  })
  .transform(normalizePathPrefix);

// NULL is the only "every path": an empty array would be a second representation of it, and the proxy
// would have to treat the two the same. `.nullable()` without `.optional()` so a PATCH omitting the field
// leaves the column alone while an explicit null clears it.
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

// Exported for the test that pins the boundary rule. The proxy refuses an ambiguous path before it gets
// here, so this only ever sees a path it can compare literally.
export const matchesPathPrefix = (prefix: string, escapedPath: string) => {
  if (prefix === "/") return true;
  if (!escapedPath.startsWith(prefix)) return false;
  const rest = escapedPath.slice(prefix.length);
  return rest === "" || rest.startsWith("/");
};
