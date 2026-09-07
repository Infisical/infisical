import RE2 from "re2";
import { z } from "zod";

// Copied from proxied-service-schemas.ts rather than imported, so that module stays independently deletable.
// Two deliberate divergences: paths are rejected outright (the Go matcher compares the decoded path while
// the upstream receives the escaped one), and a portless pattern defaults to 443 rather than any port,
// which had let plaintext port 80 match and the credential go out unencrypted.
//
// The grammar is mirrored in the CLI (packages/agentvault/match.go); the shared fixture in
// agent-vault-host-pattern-fixture.json is what keeps the two in sync.

const HOST_LABELS_RE = new RE2(/^(?:\*\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/i);
const PORT_RE = new RE2(/^\d+$/);
const IPV4_RE = new RE2(/^\d{1,3}(?:\.\d{1,3}){3}$/);
const IPV6_SCHEMA = z.string().ip({ version: "v6" });

export const AGENT_VAULT_DEFAULT_PORT = "443";
export const AGENT_VAULT_MAX_HOST_PATTERN_LENGTH = 1024;

export type TAgentVaultHostPattern = {
  host: string;
  port: string;
  isWildcard: boolean;
  key: string;
};

const isValidPort = (portStr: string) => {
  const port = Number(portStr);
  return PORT_RE.test(portStr) && port >= 1 && port <= 65535;
};

// Full eight-group lowercase form, so `[::1]` and `[0:0:0:0:0:0:0:1]` compare equal.
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

// An IPv4-mapped IPv6 address is compared as the IPv4 host it names, as Go's net.ParseIP does.
const MAPPED_IPV4_PREFIX = "0000:0000:0000:0000:0000:ffff:";

const collapseMappedIpv4 = (expanded: string): string | null => {
  if (!expanded.startsWith(MAPPED_IPV4_PREFIX)) return null;
  const [high, low] = expanded
    .slice(MAPPED_IPV4_PREFIX.length)
    .split(":")
    .map((group) => parseInt(group, 16));
  return [Math.floor(high / 256), high % 256, Math.floor(low / 256), low % 256].join(".");
};

type TParseResult = { pattern: TAgentVaultHostPattern } | { error: string };

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
    const mappedIpv4 = collapseMappedIpv4(host);
    if (mappedIpv4) host = mappedIpv4;
    else isIpv6 = true;

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

    host = host.replace(/\.$/, "");

    if (host === "*") {
      return { error: `"${raw}" is too broad. A connection must name specific hosts.` };
    }

    if (!HOST_LABELS_RE.test(host)) return { error: `"${raw}" is not a valid host pattern` };
    host = host.toLowerCase();
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

// Stored as typed, not rewritten: normalising grows the string (`[::1]` becomes 45 characters) and could
// overflow the column after the length check had passed.
export const hostPatternSchema = z
  .string()
  .trim()
  .min(1, "Host pattern is required")
  .max(AGENT_VAULT_MAX_HOST_PATTERN_LENGTH)
  .superRefine((raw, ctx) => {
    parseHostPatterns(raw).errors.forEach((message) => {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    });
  });

export const matchesHost = (pattern: TAgentVaultHostPattern, host: string, port: string): boolean => {
  if (pattern.port !== port) return false;

  let candidate = host.trim().replace(/\.$/, "").toLowerCase();
  if (candidate.startsWith("[") && candidate.endsWith("]")) candidate = candidate.slice(1, -1);
  if (IPV6_SCHEMA.safeParse(candidate).success) {
    candidate = expandIpv6(candidate);
    candidate = collapseMappedIpv4(candidate) ?? candidate;
  }

  if (!pattern.isWildcard) return pattern.host === candidate;

  const suffix = pattern.host.slice(1);
  if (!candidate.endsWith(suffix)) return false;
  const prefix = candidate.slice(0, candidate.length - suffix.length);
  return prefix !== "" && !prefix.includes(".");
};

export enum AgentVaultPatternRelation {
  Identical = "identical",
  Contained = "contained",
  Disjoint = "disjoint"
}

// A wildcard is leftmost-only and matches exactly one label, so two patterns stand in exactly one of
// these three relations. There is no partial overlap, which is what makes conflict detection exact.
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

export const intersectHostPatterns = (a: string, b: string): string[] => {
  const bKeys = new Set(parseHostPatterns(b).patterns.map((pattern) => pattern.key));
  return parseHostPatterns(a)
    .patterns.map((pattern) => pattern.key)
    .filter((key) => bKeys.has(key));
};
