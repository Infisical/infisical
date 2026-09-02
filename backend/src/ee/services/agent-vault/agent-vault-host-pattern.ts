import RE2 from "re2";
import { z } from "zod";

// Copied from proxied-service-schemas.ts rather than imported, so that module stays independently
// deletable. Two deliberate divergences, both of which close a hole in the original:
//
//   - Paths are rejected outright. The old schema ignored a path when validating but stored it, and the
//     Go matcher compares the decoded path while the upstream receives the escaped one, so
//     `/v1/safe/../../admin` (or `%2f`) matches a `/v1/safe` pattern and collects the credential.
//   - A portless pattern defaults to 443 instead of matching any port. Skipping the port check let
//     plaintext port 80 match, sending the credential unencrypted. An explicit port stays allowed,
//     `:80` included, because some internal APIs sit behind a non-443 TLS port — so the proxy must also
//     refuse to inject on any upstream it did not reach over TLS, whatever the pattern says.
//
// The matching grammar is mirrored in the CLI (packages/agentvault/match.go). The shared fixture in
// agent-vault-host-pattern-fixture.json is read by both test suites; keep them in sync through it, not
// through this comment.

const HOST_LABELS_RE = new RE2(/^(?:\*\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/i);
const PORT_RE = new RE2(/^\d+$/);
const IPV4_RE = new RE2(/^\d{1,3}(?:\.\d{1,3}){3}$/);
const IPV6_SCHEMA = z.string().ip({ version: "v6" });

export const AGENT_VAULT_DEFAULT_PORT = "443";
export const AGENT_VAULT_MAX_HOST_PATTERN_LENGTH = 1024;

export type TAgentVaultHostPattern = {
  /** Normalized host: lowercase, trailing dot stripped, IPv6 expanded and unbracketed. */
  host: string;
  /** Always populated. A portless pattern defaults to 443. */
  port: string;
  isWildcard: boolean;
  /** Canonical `host:port`, IPv6 re-bracketed. The key every overlap comparison uses. */
  key: string;
};

const isValidPort = (portStr: string) => {
  const port = Number(portStr);
  return PORT_RE.test(portStr) && port >= 1 && port <= 65535;
};

// Expands a validated IPv6 address to its full eight-group lowercase form, so `[::1]` and
// `[0:0:0:0:0:0:0:1]` compare equal. The Go matcher gets this for free from net.ParseIP.
const expandIpv6 = (address: string): string => {
  const [withoutZone] = address.split("%");

  let head = withoutZone;
  let tail = "";
  const doubleColonIdx = withoutZone.indexOf("::");
  if (doubleColonIdx !== -1) {
    head = withoutZone.slice(0, doubleColonIdx);
    tail = withoutZone.slice(doubleColonIdx + 2);
  }

  const split = (part: string) => (part === "" ? [] : part.split(":"));
  const headGroups = split(head);
  const tailGroups = split(tail);

  // A trailing dotted quad (::ffff:1.2.3.4) is two groups, not one.
  const last = tailGroups.length ? tailGroups[tailGroups.length - 1] : headGroups[headGroups.length - 1];
  if (last && IPV4_RE.test(last)) {
    const octets = last.split(".").map(Number);
    const asGroups = [(octets[0] * 256 + octets[1]).toString(16), (octets[2] * 256 + octets[3]).toString(16)];
    if (tailGroups.length) tailGroups.splice(-1, 1, ...asGroups);
    else headGroups.splice(-1, 1, ...asGroups);
  }

  const fill = new Array(8 - headGroups.length - tailGroups.length).fill("0") as string[];
  return [...headGroups, ...(doubleColonIdx === -1 ? [] : fill), ...tailGroups]
    .map((group) => group.toLowerCase().padStart(4, "0"))
    .join(":");
};

type TParseResult = { pattern: TAgentVaultHostPattern } | { error: string };

// Parses one comma-separated segment. Returns a message written for the person who typed it.
const parseSegment = (segment: string): TParseResult => {
  const raw = segment.trim();
  if (raw === "") return { error: "Host pattern has an empty entry" };
  if (raw.includes("://")) return { error: `"${raw}" must not include a scheme (e.g. https://)` };
  if (raw.includes("/")) {
    return {
      error: `"${raw}" must not include a path. A connection covers a whole host, so remove everything from the first "/".`
    };
  }

  let host: string;
  let port = "";
  let isIpv6 = false;

  if (raw.startsWith("[")) {
    const closingIdx = raw.indexOf("]");
    if (closingIdx === -1) return { error: `"${raw}" has an unclosed IPv6 bracket` };

    const inner = raw.slice(1, closingIdx);
    if (!IPV6_SCHEMA.safeParse(inner).success) return { error: `"${raw}" is not a valid IPv6 address` };

    host = expandIpv6(inner);
    isIpv6 = true;

    const afterBracket = raw.slice(closingIdx + 1);
    if (afterBracket) {
      if (!afterBracket.startsWith(":") || !isValidPort(afterBracket.slice(1))) {
        return { error: `"${raw}" has an invalid port` };
      }
      port = afterBracket.slice(1);
    }
  } else {
    host = raw;
    const colonIdx = raw.lastIndexOf(":");
    if (colonIdx !== -1) {
      host = raw.slice(0, colonIdx);
      const portStr = raw.slice(colonIdx + 1);
      if (!isValidPort(portStr)) return { error: `"${raw}" has an invalid port` };
      port = portStr;
    }

    // A trailing dot is the same name to DNS, so normalize it away rather than storing two spellings.
    host = host.replace(/\.$/, "");
    if (!HOST_LABELS_RE.test(host)) return { error: `"${raw}" is not a valid host pattern` };
    host = host.toLowerCase();

    if (host === "*" || host === "*.") {
      return { error: `"${raw}" is too broad. A connection must name specific hosts.` };
    }
  }

  const resolvedPort = port || AGENT_VAULT_DEFAULT_PORT;
  return {
    pattern: {
      host,
      port: resolvedPort,
      isWildcard: host.startsWith("*."),
      key: isIpv6 ? `[${host}]:${resolvedPort}` : `${host}:${resolvedPort}`
    }
  };
};

/** Splits, validates and normalizes a comma-separated host pattern column. Throws nothing; see the schema. */
export const parseHostPatterns = (raw: string): { patterns: TAgentVaultHostPattern[]; errors: string[] } => {
  const patterns: TAgentVaultHostPattern[] = [];
  const errors: string[] = [];

  raw.split(",").forEach((segment) => {
    const result = parseSegment(segment);
    if ("error" in result) {
      errors.push(result.error);
      return;
    }
    if (patterns.some((existing) => existing.key === result.pattern.key)) {
      errors.push(`"${result.pattern.key}" is listed more than once`);
      return;
    }
    patterns.push(result.pattern);
  });

  if (!patterns.length && !errors.length) errors.push("Host pattern is required");
  return { patterns, errors };
};

/** The canonical form written to the column, so one host is never stored two ways. */
export const normalizeHostPattern = (raw: string): string =>
  parseHostPatterns(raw)
    .patterns.map((pattern) => pattern.key)
    .join(",");

export const hostPatternSchema = z
  .string()
  .trim()
  .min(1, "Host pattern is required")
  .max(AGENT_VAULT_MAX_HOST_PATTERN_LENGTH)
  .superRefine((raw, ctx) => {
    parseHostPatterns(raw).errors.forEach((message) => {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    });
  })
  .transform(normalizeHostPattern);

/**
 * Whether a pattern covers a concrete host and port. The proxy does the real matching in Go; this exists
 * so the two grammars can be held to the same shared fixture, and so the mint dialog can answer "what
 * does this session reach" without guessing.
 */
export const matchesHost = (pattern: TAgentVaultHostPattern, host: string, port: string): boolean => {
  if (pattern.port !== port) return false;

  let candidate = host.trim().replace(/\.$/, "").toLowerCase();
  if (candidate.startsWith("[") && candidate.endsWith("]")) candidate = candidate.slice(1, -1);
  if (IPV6_SCHEMA.safeParse(candidate).success) candidate = expandIpv6(candidate);

  if (!pattern.isWildcard) return pattern.host === candidate;

  const suffix = pattern.host.slice(1);
  if (!candidate.endsWith(suffix)) return false;
  const prefix = candidate.slice(0, candidate.length - suffix.length);
  return prefix !== "" && !prefix.includes(".");
};

export enum AgentVaultPatternRelation {
  Identical = "identical",
  /** One pattern's hosts are a strict subset of the other's: an exact host under a wildcard. */
  Contained = "contained",
  Disjoint = "disjoint"
}

// Because a wildcard is leftmost-only and matches exactly one label, and a portless pattern defaults to
// 443, any two patterns stand in exactly one of these three relations. There is no partial overlap, which
// is what makes write-time conflict detection exact rather than a heuristic.
export const relateHostPatterns = (a: TAgentVaultHostPattern, b: TAgentVaultHostPattern): AgentVaultPatternRelation => {
  if (a.port !== b.port) return AgentVaultPatternRelation.Disjoint;
  if (a.host === b.host) return AgentVaultPatternRelation.Identical;

  const covers = (wildcard: TAgentVaultHostPattern, exact: TAgentVaultHostPattern) => {
    if (!wildcard.isWildcard || exact.isWildcard) return false;
    const suffix = wildcard.host.slice(1);
    if (!exact.host.endsWith(suffix)) return false;
    const prefix = exact.host.slice(0, exact.host.length - suffix.length);
    return prefix !== "" && !prefix.includes(".");
  };

  if (covers(a, b) || covers(b, a)) return AgentVaultPatternRelation.Contained;
  return AgentVaultPatternRelation.Disjoint;
};

/**
 * The keys two host-pattern columns both cover exactly. This is an intersection test, not set equality:
 * `{api.foo.com, api.bar.com}` and `{api.foo.com}` are a genuine conflict, and comparing whole columns
 * would let them sit in one bundle where nothing can break the tie between them.
 */
export const intersectHostPatterns = (a: string, b: string): string[] => {
  const bKeys = new Set(parseHostPatterns(b).patterns.map((pattern) => pattern.key));
  return parseHostPatterns(a)
    .patterns.map((pattern) => pattern.key)
    .filter((key) => bKeys.has(key));
};
