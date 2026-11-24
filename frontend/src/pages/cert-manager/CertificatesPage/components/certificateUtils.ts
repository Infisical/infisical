import { z } from "zod";

import { isIPv4, isIPv6 } from "@app/helpers/ip";
import { CaType } from "@app/hooks/api/ca";
import { TCertificateProfileDefaults } from "@app/hooks/api/certificateProfiles/types";
import {
  COMMON_NAME_REFERENCE_LABEL,
  CertSubjectAlternativeNameType,
  CertSubjectAttributeType,
  isRequestReference
} from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

export const getSanPlaceholder = (sanType: CertSubjectAlternativeNameType): string => {
  switch (sanType) {
    case CertSubjectAlternativeNameType.DNS_NAME:
      return "example.com or *.example.com";
    case CertSubjectAlternativeNameType.IP_ADDRESS:
      return "192.168.1.1";
    case CertSubjectAlternativeNameType.EMAIL:
      return "admin@example.com";
    case CertSubjectAlternativeNameType.URI:
      return "https://example.com";
    case CertSubjectAlternativeNameType.UPN:
      return "jsmith@example.com";
    default:
      return "Enter value";
  }
};

export const getSanTypeLabels = () => ({
  [CertSubjectAlternativeNameType.DNS_NAME]: "DNS",
  [CertSubjectAlternativeNameType.IP_ADDRESS]: "IP",
  [CertSubjectAlternativeNameType.EMAIL]: "Email",
  [CertSubjectAlternativeNameType.URI]: "URI",
  [CertSubjectAlternativeNameType.UPN]: "UPN"
});

export type SubjectAltName = {
  type: CertSubjectAlternativeNameType;
  value: string;
  isFromCommonName?: boolean;
};

export const getProfileReferenceSans = (
  defaults?: TCertificateProfileDefaults | null
): SubjectAltName[] =>
  (defaults?.subjectAltNames ?? []).filter(
    (san, index, sans): san is SubjectAltName =>
      isRequestReference(san.value) &&
      sans.findIndex((other) => other.type === san.type && isRequestReference(other.value)) ===
        index
  );

const REQUEST_REFERENCE_OPENING = "{{";

export const isLiteralSanValue = (value: string) => !value.includes(REQUEST_REFERENCE_OPENING);

export const isSupportedSanRuleValue = (value: string) =>
  isLiteralSanValue(value) || isRequestReference(value);

export const UNSUPPORTED_REFERENCE_MESSAGE = `Only "${COMMON_NAME_REFERENCE_LABEL}" is supported`;

export type SubjectAttribute = {
  type: CertSubjectAttributeType;
  value: string;
};

export const SUBJECT_ATTRIBUTE_LABELS: Record<CertSubjectAttributeType, string> = {
  [CertSubjectAttributeType.COMMON_NAME]: "Common Name",
  [CertSubjectAttributeType.ORGANIZATION]: "Organization",
  [CertSubjectAttributeType.ORGANIZATIONAL_UNIT]: "Organizational Unit",
  [CertSubjectAttributeType.COUNTRY]: "Country",
  [CertSubjectAttributeType.STATE]: "State/Province",
  [CertSubjectAttributeType.LOCALITY]: "Locality",
  [CertSubjectAttributeType.DOMAIN_COMPONENT]: "Domain Component"
};

export const sanTypeCandidatesFromValue = (value: string): CertSubjectAlternativeNameType[] => {
  if (isIPv4(value) || isIPv6(value)) return [CertSubjectAlternativeNameType.IP_ADDRESS];
  if (value.includes("@"))
    return [CertSubjectAlternativeNameType.EMAIL, CertSubjectAlternativeNameType.UPN];
  if (value.startsWith("http")) return [CertSubjectAlternativeNameType.URI];
  return [CertSubjectAlternativeNameType.DNS_NAME];
};

export const detectSanTypeFromValue = (value: string): CertSubjectAlternativeNameType =>
  sanTypeCandidatesFromValue(value)[0];

const MAX_DNS_NAME_LENGTH = 253;

const DNS_NAME_REGEX =
  /^(\*\.)?([a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?\.)*[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?\.?$/i;

const isEmailValue = (value: string) => z.string().email().safeParse(value).success;

const isUriValue = (value: string) => {
  try {
    return Boolean(new URL(value).protocol);
  } catch {
    return false;
  }
};

const SAN_VALUE_VALIDATORS: Record<CertSubjectAlternativeNameType, (value: string) => boolean> = {
  [CertSubjectAlternativeNameType.DNS_NAME]: (value) =>
    value.length <= MAX_DNS_NAME_LENGTH &&
    !isIPv4(value) &&
    !isIPv6(value) &&
    DNS_NAME_REGEX.test(value),
  [CertSubjectAlternativeNameType.IP_ADDRESS]: (value) => isIPv4(value) || isIPv6(value),
  [CertSubjectAlternativeNameType.EMAIL]: isEmailValue,
  [CertSubjectAlternativeNameType.UPN]: isEmailValue,
  [CertSubjectAlternativeNameType.URI]: isUriValue
};

export const isValidSanValue = (type: CertSubjectAlternativeNameType, value: string) =>
  SAN_VALUE_VALIDATORS[type](value);

export const formatSubjectAltNames = (subjectAltNames: SubjectAltName[]) => {
  return subjectAltNames
    .filter((san) => san.value.trim())
    .map((san) => ({
      type: san.type,
      value: san.value.trim()
    }));
};

export const rowErrorsOf = (fieldErrors: unknown): (string | undefined)[] | undefined =>
  Array.isArray(fieldErrors)
    ? (fieldErrors as ({ value?: { message?: string } } | undefined)[]).map(
        (rowError) => rowError?.value?.message
      )
    : undefined;

export const filterUsages = <T extends Record<string, boolean>>(usages: T): string[] => {
  return Object.entries(usages)
    .filter(([, value]) => value)
    .map(([key]) => key);
};

export const getAttributeValue = (
  subjectAttributes: Array<{ type: string; value: string }> | undefined,
  type: string
): string => subjectAttributes?.find((attr) => attr.type === type)?.value?.trim() || "";

export type SubjectAttrKey =
  | "commonName"
  | "organization"
  | "organizationalUnit"
  | "country"
  | "state"
  | "locality";

export const SUBJECT_ATTR_MAP: {
  attrType: CertSubjectAttributeType;
  requestKey: SubjectAttrKey;
}[] = [
  { attrType: CertSubjectAttributeType.COMMON_NAME, requestKey: "commonName" },
  { attrType: CertSubjectAttributeType.ORGANIZATION, requestKey: "organization" },
  { attrType: CertSubjectAttributeType.ORGANIZATIONAL_UNIT, requestKey: "organizationalUnit" },
  { attrType: CertSubjectAttributeType.COUNTRY, requestKey: "country" },
  { attrType: CertSubjectAttributeType.STATE, requestKey: "state" },
  { attrType: CertSubjectAttributeType.LOCALITY, requestKey: "locality" }
];

export const isExternalTemplateCa = (externalCaType?: CaType | string | null) =>
  externalCaType === CaType.ADCS || externalCaType === CaType.AZURE_AD_CS;

export const EXTERNAL_CA_TEMPLATE_HINT =
  "Validity, key usages, extended key usages and basic constraints are controlled by the external CA's certificate template.";
