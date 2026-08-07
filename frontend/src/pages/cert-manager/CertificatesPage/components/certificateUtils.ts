import { isIPv4, isIPv6 } from "@app/helpers/ip";
import {
  CertSubjectAlternativeNameType,
  CertSubjectAttributeType
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

export const formatSubjectAltNames = (subjectAltNames: SubjectAltName[]) => {
  return subjectAltNames
    .filter((san) => san.value.trim())
    .map((san) => ({
      type: san.type,
      value: san.value.trim()
    }));
};

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
