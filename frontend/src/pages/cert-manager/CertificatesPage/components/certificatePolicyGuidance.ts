import {
  TCertificatePolicy,
  TCertificatePolicyRule,
  TSubjectRule
} from "@app/hooks/api/certificatePolicies";
import {
  CertSubjectAlternativeNameType,
  CertSubjectAttributeType,
  formatSANType
} from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

import { SUBJECT_ATTRIBUTE_LABELS, SubjectAltName, SubjectAttribute } from "./certificateUtils";

type SanRule = NonNullable<TCertificatePolicyRule["sans"]>[number];

type ValueRule = {
  allowed?: string[];
  required?: string[];
  denied?: string[];
};

const MAX_LISTED_PATTERNS = 6;

const formatPatterns = (patterns: string[]): string => {
  const shown = patterns.slice(0, MAX_LISTED_PATTERNS);
  const remaining = patterns.length - shown.length;
  return remaining > 0 ? `${shown.join(", ")} (+${remaining} more)` : shown.join(", ");
};

/**
 * Hints carry the policy editor's own words (Require / Allow / Deny) so a requester can line the
 * constraint up against the rule that produced it. Each constraint gets its own line, and a line
 * ends on the pattern list rather than a period, because a trailing period reads as part of a
 * domain name ("dawg.com." is a valid FQDN).
 */
const labelledLine = (label: "Required" | "Allowed" | "Denied", patterns: string[]): string =>
  `${label}: ${formatPatterns(patterns)}`;

const patternClause = (verb: string, connector: string, patterns: string[]): string =>
  patterns.length === 1
    ? `${verb} ${patterns[0]}`
    : `${verb} ${connector}: ${formatPatterns(patterns)}`;

const isWildcardPattern = (pattern: string) => pattern.includes("*");

// Mirrors matchesNormalizedPattern in backend/src/services/certificate-policy/certificate-policy-fns.ts.
// Both sides must already be normalized by the caller.
const matchesNormalizedPattern = (value: string, pattern: string): boolean => {
  if (!isWildcardPattern(pattern)) return pattern === value;

  try {
    const expression = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${expression}$`).test(value);
  } catch {
    return pattern === value;
  }
};

const normalizeUri = (value: string): string => {
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/?#]*)([/?#].*)?$/.exec(value);
  if (!match) return value;
  return `${match[1].toLowerCase()}${match[2] ?? ""}`;
};

const normalizeValue = (value: string, isUri: boolean) =>
  isUri ? normalizeUri(value) : value.toLowerCase();

const matchesAny = (value: string, patterns?: string[], isUri = false): boolean =>
  Boolean(
    patterns?.some((pattern) =>
      matchesNormalizedPattern(normalizeValue(value, isUri), normalizeValue(pattern, isUri))
    )
  );

const parseSequence = (value: string): string[] =>
  value
    .split(",")
    .map((component) => component.trim())
    .filter((component) => component.length > 0);

const formatSequence = (sequence: string[]): string =>
  sequence.map((component) => `DC=${component}`).join(",");

/**
 * The same values as `formatPatterns`, but one per entry. A domain component sequence contains
 * commas of its own, so comma-joining a list of them reads as one long undifferentiated run.
 */
const listPatterns = (patterns: string[]): string[] => {
  const shown = patterns.slice(0, MAX_LISTED_PATTERNS);
  const remaining = patterns.length - shown.length;
  return remaining > 0 ? [...shown, `+${remaining} more`] : shown;
};

const listSequences = (sequences: string[][]): string[] =>
  listPatterns(sequences.map(formatSequence));

/** A finding no single row can own, such as an ordered sequence or a set-level requirement. */
export type PolicyNotice = {
  /** Distinguishes notices that word the same fault identically but list different patterns. */
  key: string;
  message: string;
  /** Names what `items` are, in the policy editor's words. */
  label?: string;
  /** Rendered one per line, because an entry may contain commas of its own. */
  items?: string[];
};

const noticeKey = ({ message, label, items }: Omit<PolicyNotice, "key">): string =>
  [message, label ?? "", ...(items ?? [])].join("\u0000");

const toNotice = (notice: Omit<PolicyNotice, "key">): PolicyNotice => ({
  ...notice,
  key: noticeKey(notice)
});

const dedupeNotices = (notices: PolicyNotice[]): PolicyNotice[] => [
  ...new Map(notices.map((notice) => [notice.key, notice])).values()
];

const matchesSequence = (request: string[], policy: string[]): boolean =>
  request.length === policy.length &&
  request.every((component, index) =>
    matchesNormalizedPattern(component.toLowerCase(), policy[index].toLowerCase())
  );

const matchesAnySequence = (request: string[], policies: string[][]): boolean =>
  policies.some((policy) => matchesSequence(request, policy));

const containsSequence = (request: string[], policy: string[]): boolean => {
  if (policy.length === 0 || policy.length > request.length) return false;
  return request.some(
    (_, offset) =>
      offset + policy.length <= request.length &&
      matchesSequence(request.slice(offset, offset + policy.length), policy)
  );
};

const containsAnySequence = (request: string[], policies: string[][]): boolean =>
  policies.some((policy) => containsSequence(request, policy));

const concatValues = (first?: string[], second?: string[]): string[] | undefined =>
  first || second ? [...(first ?? []), ...(second ?? [])] : undefined;

const mergeRules = <T extends ValueRule>(existing: T | undefined, incoming: T): T =>
  existing
    ? {
        ...existing,
        allowed: concatValues(existing.allowed, incoming.allowed),
        required: concatValues(existing.required, incoming.required),
        denied: concatValues(existing.denied, incoming.denied)
      }
    : incoming;

type CertificatePolicyRules = {
  subject: Partial<Record<CertSubjectAttributeType, TSubjectRule>>;
  sans: Partial<Record<CertSubjectAlternativeNameType, SanRule>>;
  /** An absent subject/SAN policy means no constraint at all, which is different from an empty one. */
  hasSubjectPolicy: boolean;
  hasSanPolicy: boolean;
};

const EMPTY_POLICY_RULES: CertificatePolicyRules = {
  subject: {},
  sans: {},
  hasSubjectPolicy: false,
  hasSanPolicy: false
};

export const buildPolicyRules = (policy?: TCertificatePolicy | null): CertificatePolicyRules => {
  if (!policy) return EMPTY_POLICY_RULES;

  const subject: Partial<Record<CertSubjectAttributeType, TSubjectRule>> = {};
  policy.subject?.forEach((rule) => {
    const type = rule.type as CertSubjectAttributeType;
    subject[type] = mergeRules(subject[type], rule);
  });

  const sans: Partial<Record<CertSubjectAlternativeNameType, SanRule>> = {};
  policy.sans?.forEach((rule) => {
    const type = rule.type as CertSubjectAlternativeNameType;
    sans[type] = mergeRules(sans[type], rule);
  });

  return {
    subject,
    sans,
    hasSubjectPolicy: Boolean(policy.subject),
    hasSanPolicy: Boolean(policy.sans)
  };
};

const getSubjectAttributeHint = (rule?: TSubjectRule): string[] | undefined => {
  if (!rule) return undefined;

  const lines: string[] = [];
  // `allowed` cannot widen a rule that already carries `required`, so only one of the two is real.
  if (rule.required?.length) lines.push(labelledLine("Required", rule.required));
  else if (rule.allowed?.length) lines.push(labelledLine("Allowed", rule.allowed));
  if (rule.denied?.length) lines.push(labelledLine("Denied", rule.denied));
  return lines.length > 0 ? lines : undefined;
};

const formatComponentCounts = (lengths: number[]): string => {
  const unique = Array.from(new Set(lengths)).sort((a, b) => a - b);
  return `${unique.join(" or ")} component${unique.length === 1 && unique[0] === 1 ? "" : "s"}`;
};

/** The sequence a domain component rule accepts, preferring `required` the way the backend does. */
const acceptedSequences = (rule: TSubjectRule): string[][] | undefined => {
  const patterns = rule.required?.length ? rule.required : rule.allowed;
  return patterns?.length ? patterns.map(parseSequence) : undefined;
};

const componentMatches = (component: string, option?: string): boolean =>
  option !== undefined && matchesNormalizedPattern(component.toLowerCase(), option.toLowerCase());

/**
 * The sequences still in play at a position, given what the rows before it already hold. Once
 * "corp" is entered, a sequence starting with "zamn" can no longer apply, so offering its later
 * components would send the requester down a branch they have already left.
 *
 * A row that is empty or already wrong rules nothing out, so guidance further along survives it.
 */
const reachableSequences = (
  components: string[],
  position: number,
  sequences: string[][]
): string[][] => {
  const reachable = sequences.filter((sequence) =>
    components
      .slice(0, position)
      .every((component, index) => !component || componentMatches(component, sequence[index]))
  );
  return reachable.length > 0 ? reachable : sequences;
};

/**
 * Components that would extend a denied run at this position, either continuing one the rows before
 * it have already begun or starting a fresh one here. A denied run may sit anywhere in the chain,
 * so every offset counts, but only those with enough rows left to actually complete the run: with
 * three rows, a three-component run can only start at the first one.
 */
const deniedComponentsAt = (
  components: string[],
  position: number,
  denied: string[][]
): string[] => {
  const options = denied.flatMap((sequence) =>
    // `matched` is how much of the run the rows before this one already cover, so the run began at
    // `position - matched` and needs to reach `position - matched + sequence.length`.
    Array.from({ length: position + 1 }, (_, index) => index)
      .filter((matched) => {
        const start = position - matched;
        if (matched >= sequence.length) return false;
        if (start + sequence.length > components.length) return false;

        return sequence
          .slice(0, matched)
          .every((option, offset) => componentMatches(components[start + offset] ?? "", option));
      })
      .map((matched) => sequence[matched])
  );

  return Array.from(new Set(options));
};

/**
 * Domain components are an ordered sequence, so each row is constrained by its own position rather
 * than by the sequence as a whole.
 */
const getDomainComponentHint = (
  rule: TSubjectRule | undefined,
  position: number,
  components: string[]
): string[] | undefined => {
  if (!rule) return undefined;

  const lines: string[] = [];
  const sequences = acceptedSequences(rule);
  let allowedHere: string[] | undefined;

  if (sequences) {
    const candidates = reachableSequences(components, position, sequences);
    allowedHere = Array.from(
      new Set(candidates.filter((sequence) => position < sequence.length).map((s) => s[position]))
    );

    if (allowedHere.length === 0) {
      return [
        `The sequence takes ${formatComponentCounts(candidates.map((s) => s.length))}, so this row is past its end`
      ];
    }

    // A bare "*" accepts anything at this position, so there is nothing to tell the requester.
    if (!allowedHere.includes("*")) {
      lines.push(labelledLine(rule.required?.length ? "Required" : "Allowed", allowedHere));
    }
  }

  // Warning about a denied component the allowed set would never let through here is pure noise.
  // Two patterns cannot be tested for overlap, so a wildcard is assumed to be reachable.
  const isReachableHere = (component: string) =>
    !allowedHere ||
    isWildcardPattern(component) ||
    allowedHere.some((option) => componentMatches(component, option));

  const denied = deniedComponentsAt(
    components,
    position,
    (rule.denied ?? []).map(parseSequence)
  ).filter(isReachableHere);
  if (denied.length > 0) lines.push(labelledLine("Denied", denied));

  return lines.length > 0 ? lines : undefined;
};

const TTL_PATTERN = /^(\d+)([dmyh])$/;

// Mirrors parseTTL in backend/src/services/certificate-policy/certificate-policy-service.ts.
const parseTtlToMs = (ttl: string): number | undefined => {
  const match = TTL_PATTERN.exec(ttl.trim());
  if (!match) return undefined;

  const value = Number(match[1]);
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  switch (match[2]) {
    case "h":
      return value * hour;
    case "d":
      return value * day;
    case "m":
      return value * 30 * day;
    case "y":
      return value * 365 * day;
    default:
      return undefined;
  }
};

const TTL_UNIT_NAMES: Record<string, string> = {
  h: "hour",
  d: "day",
  m: "month",
  y: "year"
};

/** "365y" is the input format; a requester reading a limit wants "365 years". */
const formatTtl = (ttl: string): string => {
  const match = TTL_PATTERN.exec(ttl.trim());
  if (!match) return ttl;

  const value = Number(match[1]);
  return `${value} ${TTL_UNIT_NAMES[match[2]]}${value === 1 ? "" : "s"}`;
};

export const getValidityHint = (maxTtl?: string): string[] | undefined =>
  maxTtl ? [`Maximum: ${formatTtl(maxTtl)}`] : undefined;

export const validateTtlAgainstPolicy = (ttl: string, maxTtl?: string): string | undefined => {
  const trimmed = ttl?.trim() ?? "";
  // An empty value is the schema's business, not the policy's.
  if (!trimmed) return undefined;

  // The backend throws on an unparseable TTL, so catching the format here keeps that off the wire.
  const requested = parseTtlToMs(trimmed);
  if (requested === undefined) return "Enter a duration such as 30d, 12h, 6m, or 1y";

  if (!maxTtl) return undefined;

  const max = parseTtlToMs(maxTtl);
  if (max === undefined || requested <= max) return undefined;
  return `Exceeds the maximum validity of ${formatTtl(maxTtl)} allowed by this policy`;
};

const getSanHint = (rule?: SanRule): string[] | undefined => {
  if (!rule) return undefined;

  // Unlike a subject attribute, a required SAN pattern does not narrow what any one row may hold:
  // it demands that some SAN of this type match it, and `allowed` still widens the set.
  const lines: string[] = [];
  if (rule.required?.length) lines.push(labelledLine("Required", rule.required));
  if (rule.allowed?.length) lines.push(labelledLine("Allowed", rule.allowed));
  if (rule.denied?.length) lines.push(labelledLine("Denied", rule.denied));
  return lines.length > 0 ? lines : undefined;
};

const validateSubjectAttributeValue = (
  type: CertSubjectAttributeType,
  value: string,
  rule: TSubjectRule | undefined,
  hasSubjectPolicy: boolean
): string | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const label = SUBJECT_ATTRIBUTE_LABELS[type];
  // A subject policy that carries no rule for this type permits nothing of that type.
  if (!rule) return hasSubjectPolicy ? `${label} is not allowed by this policy` : undefined;

  // Domain components are validated as one ordered sequence, not row by row.
  if (type === CertSubjectAttributeType.DOMAIN_COMPONENT) return undefined;
  if (matchesAny(trimmed, rule.denied)) {
    return `${label} "${trimmed}" is denied by this policy`;
  }
  if (rule.required?.length && !matchesAny(trimmed, rule.required)) {
    return `${label} ${patternClause("must match", "one of", rule.required)}`;
  }
  if (!rule.required?.length && rule.allowed?.length && !matchesAny(trimmed, rule.allowed)) {
    return `${label} ${patternClause("must match", "one of", rule.allowed)}`;
  }
  return undefined;
};

const validateSanValue = (
  type: CertSubjectAlternativeNameType,
  value: string,
  rule: SanRule | undefined,
  hasSanPolicy: boolean
): string | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const isUri = type === CertSubjectAlternativeNameType.URI;
  const label = `${formatSANType(type)} SAN`;
  if (!rule) return hasSanPolicy ? `${label} is not allowed by this policy` : undefined;
  if (matchesAny(trimmed, rule.denied, isUri)) {
    return `${label} "${trimmed}" is denied by this policy`;
  }
  if (matchesAny(trimmed, rule.required, isUri)) return undefined;
  if (rule.allowed?.length && !matchesAny(trimmed, rule.allowed, isUri)) {
    const accepted = [...(rule.required ?? []), ...rule.allowed];
    return `${label} ${patternClause("must match", "one of", accepted)}`;
  }
  return undefined;
};

const DOMAIN_COMPONENT_ORDER_NOTE =
  "Rows are order-sensitive, so they must follow the policy's order.";

const DOMAIN_COMPONENT_REVERSAL_NOTE =
  "The same components in the opposite order would match, so check the row order.";

const isReversalOf = (request: string[], candidates: string[][]): boolean =>
  request.length > 1 && matchesAnySequence([...request].reverse(), candidates);

/**
 * The sequences a rule accepts that are as long as the request. Only these can say anything about
 * an individual row, since a position means nothing across sequences of a different length.
 */
const comparableSequences = (components: string[], rule?: TSubjectRule): string[][] => {
  const sequences = rule && acceptedSequences(rule);
  return (sequences ?? []).filter((sequence) => sequence.length === components.length);
};

/**
 * Per-row domain component errors, so a wrong component is marked where it was typed rather than
 * only in a summary underneath. Empty rows are left to the schema's own required-value error.
 */
const validateDomainComponentRows = (
  components: string[],
  rule?: TSubjectRule
): (string | undefined)[] => {
  const candidates = comparableSequences(components, rule);
  if (candidates.length === 0) return [];

  const label = SUBJECT_ATTRIBUTE_LABELS[CertSubjectAttributeType.DOMAIN_COMPONENT];

  return components.map((component, position) => {
    if (!component) return undefined;

    const reachable = reachableSequences(components, position, candidates);
    const options = Array.from(new Set(reachable.map((sequence) => sequence[position])));
    const isAccepted = options.some((option) => componentMatches(component, option));

    return isAccepted ? undefined : `${label} ${patternClause("must match", "one of", options)}`;
  });
};

/** Domain component faults no single row can own: the wrong count, a denied run, a reversed order. */
const validateDomainComponents = (
  components: string[],
  rule: TSubjectRule | undefined,
  isReportedPerRow: boolean
): PolicyNotice[] => {
  if (!rule || components.length === 0) return [];

  const notices: PolicyNotice[] = [];
  const allowed = (rule.allowed ?? []).map(parseSequence);
  const required = (rule.required ?? []).map(parseSequence);
  const denied = (rule.denied ?? []).map(parseSequence);
  const formatted = formatSequence(components);

  const isDenied = containsAnySequence(components, denied);
  if (isDenied) {
    notices.push(
      toNotice({
        message: `Domain components "${formatted}" are denied by this policy.`,
        label: "Denied",
        items: listSequences(denied)
      })
    );
  }

  const describeMismatch = (candidates: string[][], label: string) => {
    if (candidates.length === 0 || matchesAnySequence(components, candidates)) return;

    const items = listSequences(candidates);
    const lengths = candidates.map((sequence) => sequence.length);
    if (!lengths.includes(components.length)) {
      // A count mismatch is the most common way a sequence fails, and naming it beats "do not match".
      notices.push(
        toNotice({
          message: `Domain components must form a sequence of ${formatComponentCounts(lengths)}, but this request has ${components.length}.`,
          label,
          items
        })
      );
    } else if (!isReportedPerRow) {
      // Otherwise the rows carry the fault themselves, on the exact component that is wrong.
      notices.push(
        toNotice({
          message: `Domain components "${formatted}" do not match. ${DOMAIN_COMPONENT_ORDER_NOTE}`,
          label,
          items
        })
      );
    }

    if (isReversalOf(components, candidates)) {
      notices.push(toNotice({ message: DOMAIN_COMPONENT_REVERSAL_NOTE }));
    }
  };

  const satisfiesRequired = required.length > 0 && matchesAnySequence(components, required);
  describeMismatch(required, "Required");
  if (!isDenied && !satisfiesRequired) describeMismatch(allowed, "Allowed");

  // The required and allowed branches can word the same fault identically, and both can add the
  // reversal note. Saying it twice is never useful.
  return dedupeNotices(notices);
};

/** A single literal pattern can be filled in for the user; wildcards cannot. */
const literalSuggestion = (patterns: string[]): string =>
  patterns.length === 1 && !isWildcardPattern(patterns[0]) ? patterns[0] : "";

/**
 * One row per component of the required sequence, prefilled only where the value is knowable. A
 * wildcard fixes the position but not the value, so it still earns a row: a policy requiring
 * "*,*,*" needs three domain components even though none of them can be filled in.
 */
const requiredSequenceRows = (rule: TSubjectRule): string[] => {
  const sequences = (rule.required ?? []).map(parseSequence);
  if (sequences.length === 0) return [""];

  // Sequences of differing length leave the row count unknowable, so fall back to a single row.
  const lengths = new Set(sequences.map((sequence) => sequence.length));
  if (lengths.size !== 1) return [""];

  return Array.from({ length: sequences[0].length }, (_, position) => {
    const options = Array.from(new Set(sequences.map((sequence) => sequence[position])));
    // A position is fillable only when every sequence agrees on one literal value for it.
    return options.length === 1 && !isWildcardPattern(options[0]) ? options[0] : "";
  });
};

/**
 * Seeds the rows the policy demands so the requirement is visible as a field the moment a profile
 * is chosen, rather than as a banner the requester has to act on. Literal patterns are filled in;
 * wildcard ones leave a blank row for the requester.
 */
export const withRequiredRows = (
  rules: CertificatePolicyRules,
  subjectAttributes: SubjectAttribute[],
  subjectAltNames: SubjectAltName[]
): { subjectAttributes: SubjectAttribute[]; subjectAltNames: SubjectAltName[] } => {
  const subject = subjectAttributes.map((attr) => ({ ...attr }));

  Object.entries(rules.subject).forEach(([rawType, rule]) => {
    const type = rawType as CertSubjectAttributeType;
    if (!rule?.required?.length) return;

    if (type === CertSubjectAttributeType.DOMAIN_COMPONENT) {
      if (subject.some((attr) => attr.type === type)) return;
      requiredSequenceRows(rule).forEach((value) => subject.push({ type, value }));
      return;
    }

    const suggestion = literalSuggestion(rule.required);
    const existing = subject.find((attr) => attr.type === type);
    if (!existing) {
      subject.push({ type, value: suggestion });
    } else if (!existing.value && suggestion) {
      existing.value = suggestion;
    }
  });

  const sans = subjectAltNames.map((san) => ({ ...san }));

  Object.entries(rules.sans).forEach(([rawType, rule]) => {
    const type = rawType as CertSubjectAlternativeNameType;
    if (!rule?.required?.length) return;

    const isUri = type === CertSubjectAlternativeNameType.URI;
    let unclaimedBlankRows = sans.filter((san) => san.type === type && !san.value.trim()).length;

    rule.required.forEach((pattern) => {
      const isSatisfied = sans.some(
        (san) =>
          san.type === type && san.value.trim() && matchesAny(san.value.trim(), [pattern], isUri)
      );
      if (isSatisfied) return;

      if (!isWildcardPattern(pattern)) {
        sans.push({ type, value: pattern });
      } else if (unclaimedBlankRows > 0) {
        unclaimedBlankRows -= 1;
      } else {
        sans.push({ type, value: "" });
      }
    });
  });

  return { subjectAttributes: subject, subjectAltNames: sans };
};

/** What the policy has to say about one subject attribute or SAN row. */
export type PolicyRowGuidance = {
  /** The constraint in the policy editor's own words, one line per clause. */
  hint?: string[];
  /** How this row's current value breaks the policy. */
  error?: string;
  /** Seeded to satisfy a `required` rule: neither removable nor retypeable. */
  isLocked: boolean;
};

export type PolicySectionGuidance = {
  rows: PolicyRowGuidance[];
  notices: PolicyNotice[];
  /** Whether this section holds something the request cannot be submitted with. */
  isBlocking: boolean;
};

export type SubjectPolicyGuidance = {
  subject: PolicySectionGuidance;
  sans: PolicySectionGuidance;
};

export const evaluateSubjectStep = ({
  rules,
  subjectAttributes,
  subjectAltNames,
  isSubjectSectionShown,
  isSanSectionShown
}: {
  rules: CertificatePolicyRules;
  subjectAttributes: SubjectAttribute[];
  subjectAltNames: SubjectAltName[];
  isSubjectSectionShown: boolean;
  isSanSectionShown: boolean;
}): SubjectPolicyGuidance => {
  const domainComponentRule = rules.subject[CertSubjectAttributeType.DOMAIN_COMPONENT];

  // Domain components are one ordered sequence spread across rows, so they are judged in row order
  // rather than individually like every other attribute type.
  const domainComponentValues = subjectAttributes
    .filter((attr) => attr.type === CertSubjectAttributeType.DOMAIN_COMPONENT)
    .map((attr) => attr.value.trim());
  const domainComponentErrors = validateDomainComponentRows(
    domainComponentValues,
    domainComponentRule
  );

  let domainComponentPosition = 0;
  let lockableDomainComponents = domainComponentRule?.required?.length
    ? requiredSequenceRows(domainComponentRule).length
    : 0;

  const subjectRows: PolicyRowGuidance[] = subjectAttributes.map((attr) => {
    const rule = rules.subject[attr.type];

    if (attr.type !== CertSubjectAttributeType.DOMAIN_COMPONENT) {
      return {
        hint: getSubjectAttributeHint(rule),
        error: validateSubjectAttributeValue(attr.type, attr.value, rule, rules.hasSubjectPolicy),
        isLocked: Boolean(rule?.required?.length)
      };
    }

    const position = domainComponentPosition;
    domainComponentPosition += 1;

    // A required sequence has a fixed length, so removing any row within it breaks the request.
    // Rows beyond that length are the requester's own and stay removable.
    const isLocked = lockableDomainComponents > 0;
    if (isLocked) lockableDomainComponents -= 1;

    return {
      hint: getDomainComponentHint(domainComponentRule, position, domainComponentValues),
      error: domainComponentErrors[position],
      isLocked
    };
  });

  const subjectNotices = validateDomainComponents(
    domainComponentValues.filter(Boolean),
    domainComponentRule,
    domainComponentErrors.some(Boolean)
  );

  // A required attribute normally has a seeded row, and an empty or wrong value on that row reports
  // itself. This only speaks up when the row is missing entirely.
  if (isSubjectSectionShown) {
    Object.entries(rules.subject).forEach(([rawType, rule]) => {
      const type = rawType as CertSubjectAttributeType;
      if (!rule?.required?.length) return;
      if (subjectAttributes.some((attr) => attr.type === type)) return;

      const label = SUBJECT_ATTRIBUTE_LABELS[type];
      if (type === CertSubjectAttributeType.DOMAIN_COMPONENT) {
        const sequences = rule.required.map(parseSequence);
        subjectNotices.push(
          toNotice({
            message: `${label} rows are required.`,
            label: "Required",
            items: listSequences(sequences)
          })
        );
        return;
      }

      subjectNotices.push(
        toNotice({
          message: `${label} is required and ${patternClause("must match", "one of", rule.required)}`
        })
      );
    });
  }

  // A SAN row is fixed when it is the one holding a required pattern up: either it satisfies the
  // pattern or it is the blank row standing in for it. Claiming rows the same way withRequiredRows
  // seeds them keeps the lock on the row that matters, wherever it sits in the list.
  const lockedSanRows = new Set<number>();
  Object.entries(rules.sans).forEach(([rawType, rule]) => {
    const type = rawType as CertSubjectAlternativeNameType;
    if (!rule?.required?.length) return;

    const isUri = type === CertSubjectAlternativeNameType.URI;
    const claim = (predicate: (san: SubjectAltName) => boolean) => {
      const index = subjectAltNames.findIndex(
        (san, position) => !lockedSanRows.has(position) && san.type === type && predicate(san)
      );
      if (index >= 0) lockedSanRows.add(index);
      return index >= 0;
    };

    rule.required.forEach((pattern) => {
      const isSatisfiedBy = (san: SubjectAltName) =>
        Boolean(san.value.trim()) && matchesAny(san.value.trim(), [pattern], isUri);
      if (!claim(isSatisfiedBy)) claim((san) => !san.value.trim());
    });
  });

  const sanRows: PolicyRowGuidance[] = subjectAltNames.map((san, index) => {
    const rule = rules.sans[san.type];

    return {
      hint: getSanHint(rule),
      error: validateSanValue(san.type, san.value, rule, rules.hasSanPolicy),
      isLocked: lockedSanRows.has(index)
    };
  });

  // A required SAN pattern is set-level: the backend only asks that some SAN of that type match it,
  // so it cannot be reported on any one row.
  const sanNotices: PolicyNotice[] = [];
  if (isSanSectionShown) {
    Object.entries(rules.sans).forEach(([rawType, rule]) => {
      const type = rawType as CertSubjectAlternativeNameType;
      if (!rule?.required?.length) return;

      const isUri = type === CertSubjectAlternativeNameType.URI;
      const rows = subjectAltNames.filter((san) => san.type === type);
      const presentValues = rows.map((san) => san.value.trim()).filter(Boolean);
      // A blank row of the right type is a requirement the requester is still filling in, and the
      // empty-value error on that row already blocks. Only speak up once no blank row is left.
      let unclaimedBlankRows = rows.length - presentValues.length;

      rule.required.forEach((pattern) => {
        if (presentValues.some((value) => matchesAny(value, [pattern], isUri))) return;
        if (unclaimedBlankRows > 0) {
          unclaimedBlankRows -= 1;
          return;
        }
        sanNotices.push(
          toNotice({ message: `A ${formatSANType(type)} SAN matching ${pattern} is required` })
        );
      });
    });
  }

  // Only findings on a rendered section can block, otherwise there is nowhere to go and fix them.
  const toSection = (
    rows: PolicyRowGuidance[],
    notices: PolicyNotice[],
    isShown: boolean
  ): PolicySectionGuidance => ({
    rows,
    notices,
    isBlocking: isShown && (rows.some((row) => row.error) || notices.length > 0)
  });

  return {
    subject: toSection(subjectRows, dedupeNotices(subjectNotices), isSubjectSectionShown),
    sans: toSection(sanRows, dedupeNotices(sanNotices), isSanSectionShown)
  };
};
