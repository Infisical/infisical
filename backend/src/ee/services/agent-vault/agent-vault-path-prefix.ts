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

// An allowlist rather than a blocklist, because the prefix is compared against the request's escaped path
// and only these characters survive that encoding unchanged. Everything else is percent-encoded on the way
// out, so a prefix carrying one could never match: `/café` is compared against `/caf%C3%A9` and a prefix
// written `/repos/{owner}` against `/repos/%7Bowner%7D`. `[`, `]`, `!`, `'`, `(`, `)` and `*` are worse
// still, surviving or not depending on what the rest of the request path happens to contain.
//
// The characters this leaves out for their own reasons: '%' so the byte comparison stays exact, ';' and
// '\' because servers disagree about them (Tomcat and Jetty strip `;params` per segment, IIS reads '\'
// as '/'), and '?' and '#' because both end the path.
const PATH_PREFIX_RE = new RE2(/^\/[A-Za-z0-9\-._~$&+,/:=@]*$/);

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
    return `"${value}" can only contain letters, digits and - . _ ~ $ & + , : = @. Anything else is percent-encoded in the request URL, so a prefix carrying it would never match.`;
  return null;
};

// No `.max()` here: pathPrefixError already measures the length and says so in the product's own words,
// and Zod's check would fire alongside it, answering an over-long prefix with two messages.
export const pathPrefixSchema = z
  .string()
  .trim()
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
