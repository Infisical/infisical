import RE2 from "re2";

import { BadRequestError } from "@app/lib/errors";
import { isValidIp } from "@app/lib/ip";
import { isValidHostname } from "@app/lib/validator/validate-hostname";

import { CertSubjectAlternativeNameType, CertSubjectAttributeType } from "../certificate-common/certificate-constants";
import { EnrollmentType } from "../certificate-profile/certificate-profile-types";
import { TCertificatePolicy, TSubjectRule } from "./certificate-policy-types";

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
        : `Missing required ${CertSubjectAttributeType.DOMAIN_COMPONENT} attribute. This policy requires one of: ${formatDomainComponentSequences(required)}`
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

const WILDCARD_LABEL_PREFIX = "*.";

export const isDnsHostname = (value: string): boolean => {
  const hostname = value.startsWith(WILDCARD_LABEL_PREFIX) ? value.slice(WILDCARD_LABEL_PREFIX.length) : value;
  return !isValidIp(hostname) && isValidHostname(hostname);
};

type TSubjectAlternativeName = { type: CertSubjectAlternativeNameType; value: string };

export const includesCommonNameDnsSan = (
  subjectAlternativeNames: TSubjectAlternativeName[] | null | undefined,
  commonName: string | null | undefined
): boolean =>
  Boolean(commonName) &&
  Boolean(
    subjectAlternativeNames?.some(
      (san) =>
        san.type === CertSubjectAlternativeNameType.DNS_NAME && san.value.toLowerCase() === commonName?.toLowerCase()
    )
  );

export const withCommonNameDnsSanReason = ({
  policy,
  sanType,
  sanValue,
  request,
  error
}: {
  policy: Pick<TCertificatePolicy, "addCommonNameAsDnsSan">;
  sanType: CertSubjectAlternativeNameType;
  sanValue: string;
  request: { commonName?: string | null };
  error: string;
}): string =>
  policy.addCommonNameAsDnsSan && includesCommonNameDnsSan([{ type: sanType, value: sanValue }], request.commonName)
    ? `${error}. The policy adds the common name as a DNS name SAN, so it must follow the DNS Name rules.`
    : error;

export const addCommonNameAsDnsSan = ({
  policy,
  enrollmentType,
  commonName: requestedCommonName,
  csrCommonName,
  subjectAlternativeNames,
  isCsrSignedAsSent = false
}: {
  policy: Pick<TCertificatePolicy, "addCommonNameAsDnsSan">;
  enrollmentType: EnrollmentType;
  commonName?: string | null;
  csrCommonName?: string | null;
  subjectAlternativeNames?: TSubjectAlternativeName[];
  isCsrSignedAsSent?: boolean;
}): { subjectAlternativeNames?: TSubjectAlternativeName[]; altNameEntries?: TSubjectAlternativeName[] } => {
  const isAcme = enrollmentType === EnrollmentType.ACME;
  const commonName = isAcme ? csrCommonName : requestedCommonName;
  if (!policy.addCommonNameAsDnsSan || !commonName || isCsrSignedAsSent || (isAcme && isValidIp(commonName))) {
    return { subjectAlternativeNames };
  }

  if (includesCommonNameDnsSan(subjectAlternativeNames, commonName)) {
    return { subjectAlternativeNames };
  }

  if (!isDnsHostname(commonName)) {
    throw new BadRequestError({
      message: `The certificate policy adds the common name as a DNS name, but common name '${commonName}' is not a valid DNS host name. Use a host name such as app.example.com as the common name, or turn off 'Add common name as DNS SAN' on the policy.`
    });
  }

  const subjectAlternativeNamesWithCommonName = [
    ...(subjectAlternativeNames ?? []),
    { type: CertSubjectAlternativeNameType.DNS_NAME, value: commonName }
  ];
  return {
    subjectAlternativeNames: subjectAlternativeNamesWithCommonName,
    altNameEntries: subjectAlternativeNamesWithCommonName
  };
};

export const keepReviewedCommonNameDnsSan = ({
  reviewedSubjectAlternativeNames,
  ...input
}: Omit<Parameters<typeof addCommonNameAsDnsSan>[0], "policy"> & {
  reviewedSubjectAlternativeNames: TSubjectAlternativeName[] | null | undefined;
}): ReturnType<typeof addCommonNameAsDnsSan> => {
  const commonName = input.enrollmentType === EnrollmentType.ACME ? input.csrCommonName : input.commonName;
  return addCommonNameAsDnsSan({
    ...input,
    policy: {
      addCommonNameAsDnsSan:
        Boolean(commonName) &&
        isDnsHostname(commonName as string) &&
        includesCommonNameDnsSan(reviewedSubjectAlternativeNames, commonName)
    }
  });
};
