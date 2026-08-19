import { TAgentPolicy, TPolicyRule } from "@app/hooks/api/agentPolicies";

// Mirrors the matcher the agent proxy runs (the CLI's packages/agentproxy/policy_match.go), so a policy
// author can watch a request land against the rules as they type it. The proxy is still the only thing
// that decides a real request, and policy_match_test.go is the reference for what this has to agree
// with: it must never grow semantics the Go side lacks.

export enum PolicyRuleMismatch {
  Host = "host",
  Port = "port",
  Scheme = "scheme",
  Path = "path",
  Method = "method"
}

export type TPolicyRequest = {
  scheme: string;
  host: string;
  port: string;
  path: string;
  method: string;
};

// How the proxy picks a winner when several policies match: an exact host beats a wildcard, a named port
// beats none, and the longer path prefix beats the shorter.
export type TPolicyRuleSpecificity = {
  exactHost: boolean;
  specificPort: boolean;
  pathLength: number;
};

export const parsePolicyPattern = (raw: string) => {
  let part = raw.trim();
  let scheme = "";
  let path = "";

  const schemeIndex = part.indexOf("://");
  if (schemeIndex !== -1) {
    scheme = part.slice(0, schemeIndex).toLowerCase();
    part = part.slice(schemeIndex + 3);
  }

  const pathIndex = part.indexOf("/");
  if (pathIndex !== -1) {
    path = part.slice(pathIndex);
    part = part.slice(0, pathIndex);
  }

  // Bracketed IPv6 ([::1] or [2001:db8::1]:8443): the brackets disambiguate the port colon, and the host
  // is kept unbracketed to compare against the incoming hostname.
  if (part.startsWith("[")) {
    const end = part.indexOf("]");
    if (end !== -1) {
      const rest = part.slice(end + 1);
      return {
        scheme,
        host: part.slice(1, end),
        port: rest.startsWith(":") ? rest.slice(1) : "",
        path
      };
    }
  }

  const portIndex = part.lastIndexOf(":");
  if (portIndex !== -1) {
    return { scheme, host: part.slice(0, portIndex), port: part.slice(portIndex + 1), path };
  }

  return { scheme, host: part, port: "", path };
};

// One address can be written several ways (::1 and 0:0:0:0:0:0:0:1 are the same host), which the proxy
// settles by comparing parsed addresses. WHATWG URL canonicalises both IP families, so running each side
// through it reaches the same answer without hand-rolling an address parser.
const canonicalizeHost = (host: string) => {
  const lowered = host.toLowerCase();
  try {
    const bracketed = lowered.includes(":") && !lowered.startsWith("[") ? `[${lowered}]` : lowered;
    return new URL(`http://${bracketed}`).hostname.replace(/^\[|\]$/g, "");
  } catch {
    return lowered;
  }
};

const hostsEqual = (pattern: string, host: string) =>
  pattern === host || canonicalizeHost(pattern) === canonicalizeHost(host);

// Every clause is checked rather than returning on the first failure: the proxy only needs the boolean,
// but a policy author needs to know which part of the rule turned the request away.
export const matchPolicyRule = (
  rule: { hostPattern: string; methods: string[] },
  request: TPolicyRequest
) => {
  const pattern = parsePolicyPattern(rule.hostPattern);
  const mismatches: PolicyRuleMismatch[] = [];
  const specificity: TPolicyRuleSpecificity = {
    exactHost: false,
    specificPort: false,
    pathLength: 0
  };

  const host = request.host.toLowerCase();
  const patternHost = pattern.host.toLowerCase();

  if (patternHost.startsWith("*.")) {
    // The wildcard matches exactly one extra label: api.github.com yes, a.b.github.com no.
    const suffix = patternHost.slice(1);
    const prefix = host.endsWith(suffix) ? host.slice(0, host.length - suffix.length) : null;
    if (!prefix || prefix.includes(".")) mismatches.push(PolicyRuleMismatch.Host);
  } else if (!hostsEqual(patternHost, host)) {
    mismatches.push(PolicyRuleMismatch.Host);
  } else {
    specificity.exactHost = true;
  }

  if (pattern.port) {
    if (pattern.port !== request.port) mismatches.push(PolicyRuleMismatch.Port);
    else specificity.specificPort = true;
  }

  // A rule naming https must not let a plaintext request through, or the credential leaves in the clear.
  if (pattern.scheme && pattern.scheme !== request.scheme.toLowerCase()) {
    mismatches.push(PolicyRuleMismatch.Scheme);
  }

  if (pattern.path) {
    const prefix = pattern.path.endsWith("*") ? pattern.path.slice(0, -1) : pattern.path;
    if (!request.path.startsWith(prefix)) mismatches.push(PolicyRuleMismatch.Path);
    else specificity.pathLength = prefix.length;
  }

  // An empty method list means every method, which is how the UI's "Any" is stored.
  if (
    rule.methods.length &&
    !rule.methods.some((method) => method.toUpperCase() === request.method)
  ) {
    mismatches.push(PolicyRuleMismatch.Method);
  }

  return { isMatched: !mismatches.length, mismatches, specificity };
};

export const comparePolicySpecificity = (a: TPolicyRuleSpecificity, b: TPolicyRuleSpecificity) => {
  if (a.exactHost !== b.exactHost) return a.exactHost ? 1 : -1;
  if (a.specificPort !== b.specificPort) return a.specificPort ? 1 : -1;
  return a.pathLength - b.pathLength;
};

// The proxy only ever carries http and https, and always knows the port: an https request reaches it as
// a CONNECT naming one, and a plain request defaults to 80. A scheme-less host is read as https, which
// is what an agent calling an API almost always means.
//
// Input arrives a character at a time, so half a URL is not an error, it is a request that cannot be
// evaluated yet: it returns no request and no message. A message is only for input that will never work.
export const parsePolicyRequest = (
  rawUrl: string,
  method: string
): { request: TPolicyRequest | null; error: string | null } => {
  const trimmed = rawUrl.trim();
  if (!trimmed) return { request: null, error: null };

  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed);
  if (hasScheme && !/^https?:\/\//i.test(trimmed)) {
    return { request: null, error: "The agent proxy only carries http and https requests." };
  }

  let url: URL;
  try {
    url = new URL(hasScheme ? trimmed : `https://${trimmed}`);
  } catch {
    return { request: null, error: null };
  }
  if (!url.hostname) return { request: null, error: null };

  const scheme = url.protocol.slice(0, -1).toLowerCase();
  return {
    request: {
      scheme,
      host: url.hostname.replace(/^\[|\]$/g, ""),
      port: url.port || (scheme === "https" ? "443" : "80"),
      // Rules are matched against the path alone, so the query string is dropped here rather than left
      // to fail a trailing-wildcard rule that would really have matched.
      path: url.pathname || "/",
      method: method.toUpperCase()
    },
    error: null
  };
};

// The port is always resolved, because a rule naming one has to be held to it. It is only worth showing
// when it is not the scheme's own default, which is the port the author never typed and never meant.
export const formatPolicyRequest = (request: TPolicyRequest) => {
  const isDefaultPort =
    (request.scheme === "https" && request.port === "443") ||
    (request.scheme === "http" && request.port === "80");

  return `${request.scheme}://${request.host}${isDefaultPort ? "" : `:${request.port}`}${request.path}`;
};

export type TEvaluatedRule = TPolicyRule & {
  isMatched: boolean;
  // The most specific match, which is the rule that would settle a contest between two policies.
  isDeciding: boolean;
  mismatches: PolicyRuleMismatch[];
};

// A tie keeps the earlier rule, which is what the proxy does walking the list.
export const evaluatePolicyRules = (rules: TPolicyRule[], request: TPolicyRequest) => {
  const evaluated = rules.map((rule) => ({ ...rule, ...matchPolicyRule(rule, request) }));
  const deciding = evaluated
    .filter((rule) => rule.isMatched)
    .reduce<
      (typeof evaluated)[number] | undefined
    >((winner, rule) => (!winner || comparePolicySpecificity(rule.specificity, winner.specificity) > 0 ? rule : winner), undefined);

  return {
    isMatched: Boolean(deciding),
    specificity: deciding?.specificity,
    rules: evaluated.map(
      ({ specificity, ...rule }): TEvaluatedRule => ({
        ...rule,
        isDeciding: rule.id === deciding?.id
      })
    )
  };
};

// The proxy decides against every policy attached to the agent, not one pair, and the most specific
// match is the policy whose credentials get injected. So a pair that reads as brokered can still be
// brokered by a different policy at runtime: name that policy rather than let the answer mislead.
export const findContendingAgentPolicy = (
  policy: TAgentPolicy,
  policies: TAgentPolicy[],
  specificity: TPolicyRuleSpecificity,
  request: TPolicyRequest
) => {
  // Only a policy sharing an agent can ever be resolved alongside this one.
  const ownAgentIds = new Set(policy.agents.map((agent) => agent.identityId));

  const contenders = policies.flatMap((other) => {
    if (other.id === policy.id) return [];
    const shared = other.agents.filter((agent) => ownAgentIds.has(agent.identityId));
    if (!shared.length) return [];

    const best = other.rules
      .map((rule) => matchPolicyRule(rule, request))
      .filter((match) => match.isMatched)
      .reduce<TPolicyRuleSpecificity | undefined>(
        (winner, match) =>
          !winner || comparePolicySpecificity(match.specificity, winner) > 0
            ? match.specificity
            : winner,
        undefined
      );
    if (!best) return [];

    // A full tie goes to the lexicographically smaller policy name, which is how the proxy stays
    // deterministic across an unordered list.
    const margin = comparePolicySpecificity(best, specificity);
    if (margin < 0 || (margin === 0 && other.name > policy.name)) return [];

    return [{ ...other, specificity: best, agentNames: shared.map((agent) => agent.name) }];
  });

  const [winner] = contenders.sort(
    (a, b) => comparePolicySpecificity(b.specificity, a.specificity) || (a.name < b.name ? -1 : 1)
  );
  return winner ?? null;
};
