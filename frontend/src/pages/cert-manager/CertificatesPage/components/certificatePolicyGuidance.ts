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

export type SanRule = NonNullable<TCertificatePolicyRule["sans"]>[number];

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

// Messages end on the pattern list rather than a period, because a trailing period reads as part of
// a domain name ("dawg.com." is a valid FQDN).
const asSentence = (clauses: string[]): string | undefined => {
  if (clauses.length === 0) return undefined;
  const joined = clauses.join("; ");
  return `${joined.charAt(0).toUpperCase()}${joined.slice(1)}`;
};

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

const formatSequences = (sequences: string[][]): string =>
  formatPatterns(sequences.map(formatSequence));

const sequenceClause = (verb: string, connector: string, sequences: string[][]): string =>
  patternClause(verb, connector, sequences.map(formatSequence));

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

export type CertificatePolicyRules = {
  subject: Partial<Record<CertSubjectAttributeType, TSubjectRule>>;
  sans: Partial<Record<CertSubjectAlternativeNameType, SanRule>>;
  /** An absent subject/SAN policy means no constraint at all, which is different from an empty one. */
  hasSubjectPolicy: boolean;
  hasSanPolicy: boolean;
};

export const EMPTY_POLICY_RULES: CertificatePolicyRules = {
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

/**
 * The values a rule accepts. When a rule carries `required` patterns the backend demands a match
 * against those specifically, so `allowed` no longer widens the set for subject attributes.
 */
const acceptedSubjectPatterns = (rule: TSubjectRule): string[] | undefined =>
  rule.required?.length ? rule.required : rule.allowed;

export const getSubjectAttributeHint = (
  type: CertSubjectAttributeType,
  rule?: TSubjectRule
): string | undefined => {
  if (!rule) return undefined;

  if (type === CertSubjectAttributeType.DOMAIN_COMPONENT) {
    const sequences = (rule.required?.length ? rule.required : rule.allowed)?.map(parseSequence);
    const clauses: string[] = [];
    if (sequences?.length) {
      clauses.push(sequenceClause("the ordered sequence must match", "one of", sequences));
    }
    if (rule.denied?.length) {
      clauses.push(sequenceClause("cannot contain", "any of", rule.denied.map(parseSequence)));
    }
    return asSentence(clauses);
  }

  const clauses: string[] = [];
  const accepted = acceptedSubjectPatterns(rule);
  if (accepted?.length) clauses.push(patternClause("must match", "one of", accepted));
  if (rule.denied?.length) clauses.push(patternClause("cannot match", "any of", rule.denied));
  return asSentence(clauses);
};

export const getSanHint = (rule?: SanRule): string | undefined => {
  if (!rule) return undefined;

  const clauses: string[] = [];
  if (rule.allowed?.length) {
    clauses.push(
      patternClause("must match", "one of", [...(rule.required ?? []), ...rule.allowed])
    );
  } else if (rule.required?.length) {
    clauses.push(patternClause("this policy requires one matching", "any of", rule.required));
  }
  if (rule.denied?.length) clauses.push(patternClause("cannot match", "any of", rule.denied));
  return asSentence(clauses);
};

export const validateSubjectAttributeValue = (
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

export const validateSanValue = (
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

const reversalHint = (request: string[], policies: string[][]): string => {
  const reversed = [...request].reverse();
  if (request.length < 2 || !matchesAnySequence(reversed, policies)) return "";
  return " The same components in the opposite order would match, so check the row order.";
};

/** Sequence-level domain component errors. An absent sequence is reported as a requirement instead. */
export const validateDomainComponents = (components: string[], rule?: TSubjectRule): string[] => {
  if (!rule || components.length === 0) return [];

  const errors: string[] = [];
  const allowed = (rule.allowed ?? []).map(parseSequence);
  const required = (rule.required ?? []).map(parseSequence);
  const denied = (rule.denied ?? []).map(parseSequence);
  const formatted = formatSequence(components);

  const isDenied = containsAnySequence(components, denied);
  if (isDenied) {
    errors.push(
      `Domain components "${formatted}" are denied by this policy. Denied: ${formatSequences(denied)}`
    );
  }

  const satisfiesRequired = required.length > 0 && matchesAnySequence(components, required);
  if (required.length > 0 && !satisfiesRequired) {
    errors.push(
      `Domain components "${formatted}" do not match a required sequence. ${DOMAIN_COMPONENT_ORDER_NOTE}${reversalHint(components, required)} Required: ${formatSequences(required)}`
    );
  }

  if (!isDenied && !satisfiesRequired && allowed.length > 0) {
    if (!matchesAnySequence(components, allowed)) {
      errors.push(
        `Domain components "${formatted}" are not allowed by this policy. ${DOMAIN_COMPONENT_ORDER_NOTE}${reversalHint(components, allowed)} Allowed: ${formatSequences(allowed)}`
      );
    }
  }

  return errors;
};

export type PolicyRequirement = {
  id: string;
  message: string;
  /** Rows to append when the request is missing this attribute or SAN entirely. */
  addRows?:
    | { kind: "subject"; type: CertSubjectAttributeType; values: string[] }
    | { kind: "san"; type: CertSubjectAlternativeNameType; values: string[] };
};

/** A single literal pattern can be filled in for the user; wildcards cannot. */
const literalSuggestion = (patterns: string[]): string =>
  patterns.length === 1 && !isWildcardPattern(patterns[0]) ? patterns[0] : "";

export type SubjectPolicyGuidance = {
  subjectRowHints: (string | undefined)[];
  subjectRowErrors: (string | undefined)[];
  subjectNotices: string[];
  sanRowHints: (string | undefined)[];
  sanRowErrors: (string | undefined)[];
  requirements: PolicyRequirement[];
  hasBlockingIssues: boolean;
};

export const EMPTY_SUBJECT_POLICY_GUIDANCE: SubjectPolicyGuidance = {
  subjectRowHints: [],
  subjectRowErrors: [],
  subjectNotices: [],
  sanRowHints: [],
  sanRowErrors: [],
  requirements: [],
  hasBlockingIssues: false
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
  const requirements: PolicyRequirement[] = [];

  const subjectRowHints = subjectAttributes.map((attr, index) => {
    const isFirstOfType =
      subjectAttributes.findIndex((other) => other.type === attr.type) === index;
    // A domain component rule spans every DC row, so only the first row carries the hint.
    if (attr.type === CertSubjectAttributeType.DOMAIN_COMPONENT && !isFirstOfType) return undefined;
    return getSubjectAttributeHint(attr.type, rules.subject[attr.type]);
  });

  const subjectRowErrors = subjectAttributes.map((attr) =>
    validateSubjectAttributeValue(
      attr.type,
      attr.value,
      rules.subject[attr.type],
      rules.hasSubjectPolicy
    )
  );

  const domainComponents = subjectAttributes
    .filter((attr) => attr.type === CertSubjectAttributeType.DOMAIN_COMPONENT)
    .map((attr) => attr.value.trim())
    .filter(Boolean);

  const domainComponentRule = rules.subject[CertSubjectAttributeType.DOMAIN_COMPONENT];
  const subjectNotices = validateDomainComponents(domainComponents, domainComponentRule);

  if (isSubjectSectionShown) {
    Object.entries(rules.subject).forEach(([rawType, rule]) => {
      const type = rawType as CertSubjectAttributeType;
      if (!rule?.required?.length) return;

      const label = SUBJECT_ATTRIBUTE_LABELS[type];
      if (type === CertSubjectAttributeType.DOMAIN_COMPONENT) {
        const sequences = rule.required.map(parseSequence);
        // A populated sequence that does not match already produces its own notice.
        if (domainComponents.length > 0) return;

        const onlySequence = sequences.length === 1 ? sequences[0] : undefined;
        const isFillable = Boolean(onlySequence?.every((part) => !isWildcardPattern(part)));
        requirements.push({
          id: `subject-${type}`,
          message:
            sequences.length === 1
              ? `${label} rows must form the sequence ${formatSequence(sequences[0])}`
              : `${label} rows must form one of: ${formatSequences(sequences)}`,
          ...(subjectAttributes.every((attr) => attr.type !== type) && {
            addRows: {
              kind: "subject" as const,
              type,
              values: isFillable && onlySequence ? onlySequence : [""]
            }
          })
        });
        return;
      }

      const current = subjectAttributes.find((attr) => attr.type === type);
      const value = current?.value.trim() ?? "";
      if (value && matchesAny(value, rule.required)) return;

      requirements.push({
        id: `subject-${type}`,
        message: `${label} is required and ${patternClause("must match", "one of", rule.required)}`,
        ...(!current && {
          addRows: {
            kind: "subject" as const,
            type,
            values: [literalSuggestion(rule.required)]
          }
        })
      });
    });
  }

  const sanRowHints = subjectAltNames.map((san) => getSanHint(rules.sans[san.type]));
  const sanRowErrors = subjectAltNames.map((san) =>
    validateSanValue(san.type, san.value, rules.sans[san.type], rules.hasSanPolicy)
  );

  if (isSanSectionShown) {
    Object.entries(rules.sans).forEach(([rawType, rule]) => {
      const type = rawType as CertSubjectAlternativeNameType;
      if (!rule?.required?.length) return;

      const isUri = type === CertSubjectAlternativeNameType.URI;
      const presentValues = subjectAltNames
        .filter((san) => san.type === type)
        .map((san) => san.value.trim())
        .filter(Boolean);

      // A wildcard pattern cannot be filled in for the user, so each unmet one needs its own blank
      // row. Blank rows already on the form are claimed first, one per requirement.
      let unclaimedEmptyRows = subjectAltNames.filter(
        (san) => san.type === type && !san.value.trim()
      ).length;

      rule.required.forEach((pattern) => {
        if (presentValues.some((value) => matchesAny(value, [pattern], isUri))) return;

        const requirement: PolicyRequirement = {
          id: `san-${type}-${pattern}`,
          message: `A ${formatSANType(type)} SAN matching ${pattern} is required`
        };

        if (!isWildcardPattern(pattern)) {
          requirement.addRows = { kind: "san", type, values: [pattern] };
        } else if (unclaimedEmptyRows > 0) {
          unclaimedEmptyRows -= 1;
        } else {
          requirement.addRows = { kind: "san", type, values: [""] };
        }

        requirements.push(requirement);
      });
    });
  }

  // Only issues on a rendered section can block, otherwise there is nowhere to go and fix them.
  const hasBlockingIssues =
    (isSubjectSectionShown && (subjectRowErrors.some(Boolean) || subjectNotices.length > 0)) ||
    (isSanSectionShown && sanRowErrors.some(Boolean)) ||
    requirements.length > 0;

  return {
    subjectRowHints,
    subjectRowErrors,
    subjectNotices,
    sanRowHints,
    sanRowErrors,
    requirements,
    hasBlockingIssues
  };
};

export const mergeRowErrors = (
  formErrors: (string | undefined)[] | undefined,
  policyErrors: (string | undefined)[]
): (string | undefined)[] =>
  Array.from(
    { length: Math.max(formErrors?.length ?? 0, policyErrors.length) },
    (_, index) => formErrors?.[index] ?? policyErrors[index]
  );
