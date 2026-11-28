import { isIPv6 } from "node:net";

import RE2 from "re2";
import { z } from "zod";

import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { isValidIp } from "@app/lib/ip";
import { isFQDN } from "@app/lib/validator/validate-url";

import { CertSubjectAlternativeNameType, CertSubjectAttributeType } from "../certificate-common/certificate-constants";
import { TCertificatePolicy, TSubjectRule } from "./certificate-policy-types";

// Policy durations read m as months of 30 days, unlike ms(), where m means minutes.
export const parsePolicyTtl = (ttl: string): number => {
  const match = new RE2("^(\\d+)([dmyh])$").exec(ttl);
  if (!match) {
    throw new BadRequestError({
      message: `TTL '${ttl}' is not in a supported format. Use a number followed by h, d or y, such as 24h, 90d or 1y.`
    });
  }

  const unitMs = {
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    m: 30 * 24 * 60 * 60 * 1000,
    y: 365 * 24 * 60 * 60 * 1000
  };
  return parseInt(match[1], 10) * unitMs[match[2] as keyof typeof unitMs];
};

export const describeTtlExceedsMax = (ttl: string, maxWithDays: string, requestableMax: string | undefined) =>
  `Requested validity '${ttl}' exceeds the policy's maximum of ${maxWithDays}. Request a TTL of ${requestableMax} or less`;

export const isWildcardPattern = (value: string): boolean => value.includes("*");

const createWildcardRegex = (pattern: string): RE2 => {
  const escapeRegex = new RE2(/[.+?^${}()|[\]\\]/g);
  const wildcardRegex = new RE2(/\*/g);
  return new RE2(`^${pattern.replace(escapeRegex, "\\$&").replace(wildcardRegex, ".*")}$`);
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

export const isDomainComponentRule = (rule: TSubjectRule): boolean =>
  rule.type === CertSubjectAttributeType.DOMAIN_COMPONENT;

const formatDomainComponentSequence = (sequence: string[]): string =>
  sequence.map((component) => `DC=${component}`).join(",");

const parseDomainComponentSequence = (value: string): string[] =>
  value
    .split(",")
    .map((component) => component.trim())
    .filter((component) => component.length > 0);

const formatDomainComponentSequences = (sequences: string[][]): string =>
  sequences.map((sequence) => `'${formatDomainComponentSequence(sequence)}'`).join(", ");

const matchesDomainComponentSequence = (requestSequence: string[], policySequence: string[]): boolean =>
  requestSequence.length === policySequence.length &&
  requestSequence.every((component, index) =>
    matchesNormalizedPattern(component.toLowerCase(), policySequence[index].toLowerCase())
  );

const matchesAnySequence = (requestSequence: string[], policySequences: string[][]): boolean =>
  policySequences.some((policySequence) => matchesDomainComponentSequence(requestSequence, policySequence));

const containsSequence = (requestSequence: string[], policySequence: string[]): boolean => {
  if (policySequence.length === 0 || policySequence.length > requestSequence.length) return false;

  return requestSequence.some(
    (_, offset) =>
      offset + policySequence.length <= requestSequence.length &&
      matchesDomainComponentSequence(requestSequence.slice(offset, offset + policySequence.length), policySequence)
  );
};

const containsAnySequence = (requestSequence: string[], policySequences: string[][]): boolean =>
  policySequences.some((policySequence) => containsSequence(requestSequence, policySequence));

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

const isReadableValueList = (values: unknown): values is string[] =>
  values === undefined ||
  (Array.isArray(values) &&
    values.every(
      (value) => typeof value === "string" && value.split(",").every((component) => component.trim().length > 0)
    ));

export const validateDomainComponentsAgainstRule = ({
  requestDomainComponents,
  rule,
  skipRequired = false
}: {
  requestDomainComponents: string[];
  rule: TSubjectRule;
  skipRequired?: boolean;
}): string[] => {
  // an unreadable rule is refused rather than treated as no constraint
  if (!RULE_FIELDS.every((field) => isReadableValueList(rule[field]))) {
    return [
      `The ${CertSubjectAttributeType.DOMAIN_COMPONENT} rule on this policy is malformed and cannot be evaluated. Edit the policy's domain component rule before issuing against it.`
    ];
  }

  const sequencesOf = (values: string[] = []) => values.map(parseDomainComponentSequence);

  const allowed = sequencesOf(rule.allowed);
  const required = sequencesOf(rule.required);
  const denied = sequencesOf(rule.denied);

  const errors: string[] = [];
  const hasDomainComponents = requestDomainComponents.length > 0;
  const requestSequence = formatDomainComponentSequence(requestDomainComponents);

  const isDenied = hasDomainComponents && containsAnySequence(requestDomainComponents, denied);
  if (isDenied) {
    errors.push(
      `Domain components '${requestSequence}' are denied by this policy. Denied sequences: ${formatDomainComponentSequences(denied)}`
    );
  }

  const satisfiesRequired = required.length > 0 && matchesAnySequence(requestDomainComponents, required);
  if (!skipRequired && required.length > 0 && !satisfiesRequired) {
    errors.push(
      hasDomainComponents
        ? `Domain components '${requestSequence}' do not match any required sequence: ${formatDomainComponentSequences(required)}. ${ORDER_NOTE}${reversalHint(requestDomainComponents, required)}`
        : `The request is missing the required ${CertSubjectAttributeType.DOMAIN_COMPONENT} attribute. This policy requires one of: ${formatDomainComponentSequences(required)}`
    );
  }

  const needsAllowedCheck = !isDenied && !satisfiesRequired && hasDomainComponents && allowed.length > 0;
  if (needsAllowedCheck && !matchesAnySequence(requestDomainComponents, allowed)) {
    errors.push(
      `Domain components '${requestSequence}' are not allowed by this policy. Allowed sequences: ${formatDomainComponentSequences(allowed)}. ${ORDER_NOTE}${reversalHint(requestDomainComponents, allowed)}`
    );
  }

  return errors;
};

const ASCII_ONLY_REGEX = new RE2("^[\\x21-\\x7E]+$");
const MAX_DNS_NAME_LENGTH = 253;

const isDnsHostname = (value: string): boolean =>
  ASCII_ONLY_REGEX.test(value) &&
  !isValidIp(value) &&
  value.length <= MAX_DNS_NAME_LENGTH &&
  isFQDN(value, {
    allow_wildcard: true,
    require_tld: false,
    allow_underscores: true,
    allow_trailing_dot: true,
    allow_numeric_tld: true
  });

const isEmailAddress = (value: string): boolean => z.string().email().safeParse(value).success;

const SAN_VALUE_VALIDATORS: Record<CertSubjectAlternativeNameType, (value: string) => boolean> = {
  [CertSubjectAlternativeNameType.DNS_NAME]: isDnsHostname,
  [CertSubjectAlternativeNameType.IP_ADDRESS]: isValidIp,
  [CertSubjectAlternativeNameType.EMAIL]: isEmailAddress,
  [CertSubjectAlternativeNameType.UPN]: isEmailAddress,
  [CertSubjectAlternativeNameType.URI]: (value) => z.string().url().safeParse(value).success
};

export const isValidSanValue = (type: CertSubjectAlternativeNameType, value: string): boolean =>
  SAN_VALUE_VALIDATORS[type](value);

export const normalizeUriForComparison = (value: string): string => {
  const match = new RE2("^([a-zA-Z][a-zA-Z0-9+.-]*://[^/?#]*)([/?#].*)?$").exec(value);
  if (!match) {
    return value;
  }
  return `${match[1].toLowerCase()}${match[2] ?? ""}`;
};

const TRAILING_DOT_REGEX = new RE2("\\.$");

const canonicalIp = (value: string): string => {
  if (!isIPv6(value)) return value.toLowerCase();
  try {
    return new URL(`http://[${value}]`).hostname;
  } catch {
    return value.toLowerCase();
  }
};

const normalizeSanValue = (sanType: string, value: string): string => {
  if (sanType === CertSubjectAlternativeNameType.URI) return normalizeUriForComparison(value);
  if (sanType === CertSubjectAlternativeNameType.IP_ADDRESS) return canonicalIp(value);
  if (sanType === CertSubjectAlternativeNameType.DNS_NAME) return value.toLowerCase().replace(TRAILING_DOT_REGEX, "");
  return value.toLowerCase();
};

const isSameSanValue = (sanType: string, value: string, other: string): boolean =>
  normalizeSanValue(sanType, value) === normalizeSanValue(sanType, other);

type TSubjectAlternativeName = { type: CertSubjectAlternativeNameType; value: string };

export const includesSan = (
  subjectAlternativeNames: TSubjectAlternativeName[] | null | undefined,
  san: TSubjectAlternativeName
): boolean =>
  Boolean(
    subjectAlternativeNames?.some(
      (existing) => existing.type === san.type && isSameSanValue(san.type, existing.value, san.value)
    )
  );

export enum RequestReference {
  CommonName = "{{request.commonName}}"
}

const COMMON_NAME_REFERENCE_LABEL = "common name";

const REQUEST_REFERENCE_OPENING = "{{";

export const isRequestReference = (value: string): value is RequestReference =>
  (Object.values(RequestReference) as string[]).includes(value);

const hasRequestReferenceSyntax = (value: string): boolean => value.includes(REQUEST_REFERENCE_OPENING);

export const isUnknownRequestReference = (value: string): boolean =>
  hasRequestReferenceSyntax(value) && !isRequestReference(value);

export const matchesSanRuleValue = ({
  sanType,
  sanValue,
  ruleValue,
  commonName,
  matchesPattern
}: {
  sanType: string;
  sanValue: string;
  ruleValue: string;
  commonName?: string | null;
  matchesPattern: (sanValue: string, pattern: string) => boolean;
}): boolean => {
  if (ruleValue !== RequestReference.CommonName) return matchesPattern(sanValue, ruleValue);
  return commonName ? isSameSanValue(sanType, sanValue, commonName) : false;
};

// Literal policy values are quoted so a value's own trailing period survives joinPolicyViolations.
const quotePolicyValue = (value: string): string => `'${value}'`;

export const quotePolicyValues = (values: string[]): string => values.map(quotePolicyValue).join(", ");

const formatSanRuleValue = (ruleValue: string, commonName?: string | null): string => {
  if (ruleValue !== RequestReference.CommonName) return quotePolicyValue(ruleValue);
  return commonName
    ? `the ${COMMON_NAME_REFERENCE_LABEL} '${commonName}'`
    : `the ${COMMON_NAME_REFERENCE_LABEL} (the request has none)`;
};

export const describeMissingRequiredSan = (sanType: string, ruleValue: string, commonName?: string | null): string => {
  if (ruleValue !== RequestReference.CommonName) {
    return `The request has no ${sanType} SAN matching the required pattern '${ruleValue}'. Add one to the request`;
  }
  return commonName
    ? `The request has no ${sanType} SAN equal to the ${COMMON_NAME_REFERENCE_LABEL} '${commonName}'. Add one to the request`
    : `This policy requires a ${sanType} SAN equal to the ${COMMON_NAME_REFERENCE_LABEL}, but the request has no ${COMMON_NAME_REFERENCE_LABEL}`;
};

export const describeDeniedSan = (sanType: string, sanValue: string, ruleValue: string): string =>
  ruleValue !== RequestReference.CommonName
    ? `${sanType} SAN '${sanValue}' matches the denied pattern '${ruleValue}'. Remove it from the request, or from the profile's default SANs if a default added it`
    : `${sanType} SAN '${sanValue}' is denied by this policy because it equals the ${COMMON_NAME_REFERENCE_LABEL}. Remove it from the request, or from the profile's default SANs if a default added it.`;

export const describeValueNotAllowed = ({
  fieldName,
  value,
  allowedValues,
  hasPatterns,
  formatValue = quotePolicyValue
}: {
  fieldName: string;
  value: string;
  allowedValues: string[];
  hasPatterns: boolean;
  formatValue?: (allowedValue: string) => string;
}): string => {
  const allowed = allowedValues.map(formatValue).join(", ");
  return hasPatterns
    ? `${fieldName} value '${value}' does not match allowed patterns: ${allowed}`
    : `${fieldName} value '${value}' is not in the allowed values: ${allowed}`;
};

// One violation per SAN type, so the allowed list is written once however many of the request's SANs it rejects.
export const describeDisallowedSans = (
  sanType: string,
  sanValues: string[],
  allowed: string[],
  commonName?: string | null
): string => {
  const formatValue = (ruleValue: string) => formatSanRuleValue(ruleValue, commonName);
  const hasPatterns = allowed.some((ruleValue) => isRequestReference(ruleValue) || isWildcardPattern(ruleValue));
  if (sanValues.length === 1) {
    return describeValueNotAllowed({
      fieldName: `${sanType} SAN`,
      value: sanValues[0],
      allowedValues: allowed,
      formatValue,
      hasPatterns
    });
  }
  const values = quotePolicyValues(sanValues);
  const allowedList = allowed.map(formatValue).join(", ");
  return hasPatterns
    ? `${sanType} SAN values ${values} do not match allowed patterns: ${allowedList}`
    : `${sanType} SAN values ${values} are not in the allowed values: ${allowedList}`;
};

const allowsCommonName = (policy: Pick<TCertificatePolicy, "subject">): boolean => {
  if (!policy.subject) return true;
  const commonNameRule = policy.subject.find((rule) => rule.type === CertSubjectAttributeType.COMMON_NAME);
  return Boolean(commonNameRule?.allowed || commonNameRule?.required);
};

export const describeCommonNameSanRuleWithoutCommonName = (
  policy: Pick<TCertificatePolicy, "subject" | "sans">
): string | undefined => {
  const referencesCommonName = policy.sans?.some((rule) =>
    [rule.allowed, rule.required, rule.denied].some((ruleValues) => ruleValues?.includes(RequestReference.CommonName))
  );
  if (!referencesCommonName || allowsCommonName(policy)) return undefined;
  return `To use "Same as common name" (${RequestReference.CommonName}) in a SAN rule, allow a common name in the policy's subject rules.`;
};

export const describeUnsupportedCommonNameDefaultSans = (
  policy: Pick<TCertificatePolicy, "subject" | "sans">,
  defaultSans: TSubjectAlternativeName[]
): string | undefined => {
  const referenceTypes = defaultSans.filter((san) => san.value === RequestReference.CommonName).map((san) => san.type);
  if (!referenceTypes.length) return undefined;

  if (!allowsCommonName(policy)) {
    return `The default SAN "Same as common name" (${RequestReference.CommonName}) needs a common name, but this profile's policy does not allow one. Allow a common name in the policy, or remove that default SAN.`;
  }

  const refusedTypes = [...new Set(referenceTypes)].filter(
    (type) => policy.sans && !policy.sans.some((rule) => rule.type === type)
  );
  if (refusedTypes.length) {
    return `The default SAN "Same as common name" (${RequestReference.CommonName}) is set for ${refusedTypes.join(", ")}, but this profile's policy does not allow that SAN type. Add a rule for it to the policy, or remove that default SAN.`;
  }

  const deniedTypes = [...new Set(referenceTypes)].filter((type) =>
    policy.sans?.some((rule) => rule.type === type && rule.denied?.includes(RequestReference.CommonName))
  );
  if (deniedTypes.length) {
    return `The default SAN "Same as common name" (${RequestReference.CommonName}) is set for ${deniedTypes.join(", ")}, but this profile's policy denies a SAN equal to the common name for that type. Remove the default SAN, or the denied value from the policy.`;
  }

  return undefined;
};

// Violations are joined into one sentence, so a violation's own closing period is dropped.
export const joinPolicyViolations = (errors: string[]): string =>
  `${errors.map((error) => error.replace(/\.$/, "")).join("; ")}.`;

export const describePolicyViolations = (errors: string[]): string =>
  `Certificate request does not meet the certificate policy: ${joinPolicyViolations(errors)}`;

export const certificatePolicyNotFoundError = (policyId: string) =>
  new NotFoundError({
    message: `Certificate policy with ID '${policyId}' not found. List your organization's certificate policies with GET /api/v1/cert-manager/certificate-policies to find the right ID.`
  });
