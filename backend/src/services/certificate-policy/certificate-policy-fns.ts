import RE2 from "re2";

import { CertSubjectAttributeType } from "../certificate-common/certificate-constants";
import { TDomainComponentSubjectRule, TSubjectRule } from "./certificate-policy-types";

export const isWildcardPattern = (value: string): boolean => value.includes("*");

const createWildcardRegex = (pattern: string): RE2 => {
  const wildcardRegex = new RE2(/\*/g);
  const withPlaceholder = pattern.replace(wildcardRegex, "__WILDCARD__");
  const escapeRegex = new RE2(/[.+?^${}()|[\]\\]/g);
  const escaped = withPlaceholder.replace(escapeRegex, "\\$&");
  const placeholderRegex = new RE2(/__WILDCARD__/g);
  return new RE2(`^${escaped.replace(placeholderRegex, ".*")}$`);
};

// both sides must already be normalized by the caller (lower-cased, or URI-normalized for URI SANs)
export const matchesNormalizedPattern = (value: string, pattern: string): boolean => {
  if (!isWildcardPattern(pattern)) {
    return pattern === value;
  }

  try {
    return createWildcardRegex(pattern).test(value);
  } catch {
    return pattern === value;
  }
};

export const isDomainComponentRule = (rule: TSubjectRule): rule is TDomainComponentSubjectRule =>
  rule.type === CertSubjectAttributeType.DOMAIN_COMPONENT;

export const formatDomainComponentSequence = (sequence: string[]): string =>
  sequence.map((component) => `DC=${component}`).join(",");

const formatDomainComponentSequences = (sequences: string[][]): string =>
  sequences.map((sequence) => `'${formatDomainComponentSequence(sequence)}'`).join(", ");

const matchesDomainComponentSequence = (requestSequence: string[], policySequence: string[]): boolean =>
  requestSequence.length === policySequence.length &&
  requestSequence.every((component, index) =>
    matchesNormalizedPattern(component.toLowerCase(), policySequence[index].toLowerCase())
  );

const matchesAnySequence = (requestSequence: string[], policySequences: string[][]): boolean =>
  policySequences.some((policySequence) => matchesDomainComponentSequence(requestSequence, policySequence));

const isSequenceOfLabels = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((component) => typeof component === "string");

// a flat list of labels is read as the single sequence it describes
const normalizeDomainComponentSequences = (values: unknown): unknown => {
  if (!Array.isArray(values) || values.length === 0) return values;
  return isSequenceOfLabels(values) ? [values] : values;
};

const normalizeDomainComponentRule = (rule: TDomainComponentSubjectRule): TDomainComponentSubjectRule =>
  ({
    type: rule.type,
    allowed: normalizeDomainComponentSequences(rule.allowed),
    required: normalizeDomainComponentSequences(rule.required),
    denied: normalizeDomainComponentSequences(rule.denied)
  }) as TDomainComponentSubjectRule;

export const normalizeSubjectRules = (rules: unknown): unknown => {
  if (!Array.isArray(rules)) return rules;

  return (rules as TSubjectRule[]).map((rule) =>
    rule && isDomainComponentRule(rule) ? normalizeDomainComponentRule(rule) : rule
  );
};

const ORDER_NOTE =
  "Domain components are order-sensitive, so they must appear in the same order as the policy sequence.";

const reversalHint = (requestSequence: string[], policySequences: string[][]): string => {
  const reversed = [...requestSequence].reverse();
  if (requestSequence.length < 2 || !matchesAnySequence(reversed, policySequences)) {
    return "";
  }
  return " The same components in the opposite order would match, so check which end the client encoded first.";
};

const RULE_FIELDS = ["allowed", "required", "denied"] as const;

export const validateDomainComponentsAgainstRule = ({
  requestDomainComponents,
  rule,
  skipRequired = false
}: {
  requestDomainComponents: string[];
  rule: TDomainComponentSubjectRule;
  skipRequired?: boolean;
}): string[] => {
  const normalizedRule = normalizeDomainComponentRule(rule);

  // an unreadable rule is refused rather than treated as no constraint
  const isRuleReadable = RULE_FIELDS.every(
    (field) => normalizedRule[field] === undefined || Array.isArray(normalizedRule[field])
  );
  if (!isRuleReadable) {
    return [
      `The ${CertSubjectAttributeType.DOMAIN_COMPONENT} rule on this policy is malformed and cannot be evaluated. Edit the policy's domain component rule before issuing against it.`
    ];
  }

  const { allowed = [], required = [], denied = [] } = normalizedRule;
  const errors: string[] = [];
  const hasDomainComponents = requestDomainComponents.length > 0;
  const requestSequence = formatDomainComponentSequence(requestDomainComponents);

  const isDenied = hasDomainComponents && matchesAnySequence(requestDomainComponents, denied);
  if (isDenied) {
    errors.push(`Domain components '${requestSequence}' are denied by template policy`);
  }

  const satisfiesRequired = required.length > 0 && matchesAnySequence(requestDomainComponents, required);
  if (!skipRequired && required.length > 0 && !satisfiesRequired) {
    errors.push(
      hasDomainComponents
        ? `Domain components '${requestSequence}' do not match any required sequence: ${formatDomainComponentSequences(required)}. ${ORDER_NOTE}${reversalHint(requestDomainComponents, required)}`
        : `Missing required ${CertSubjectAttributeType.DOMAIN_COMPONENT} attribute. This policy requires one of: ${formatDomainComponentSequences(required)}`
    );
  }

  const needsAllowedCheck = !isDenied && !satisfiesRequired && hasDomainComponents && allowed.length > 0;
  if (needsAllowedCheck && !matchesAnySequence(requestDomainComponents, allowed)) {
    errors.push(
      `Domain components '${requestSequence}' are not allowed by template policy. Allowed sequences: ${formatDomainComponentSequences(allowed)}. ${ORDER_NOTE}${reversalHint(requestDomainComponents, allowed)}`
    );
  }

  return errors;
};
