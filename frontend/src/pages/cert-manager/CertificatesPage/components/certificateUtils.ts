import { CertSubjectAlternativeNameType } from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

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
    default:
      return "Enter value";
  }
};

export const getSanTypeLabels = () => ({
  [CertSubjectAlternativeNameType.DNS_NAME]: "DNS",
  [CertSubjectAlternativeNameType.IP_ADDRESS]: "IP",
  [CertSubjectAlternativeNameType.EMAIL]: "Email",
  [CertSubjectAlternativeNameType.URI]: "URI"
});

export type SubjectAltName = {
  type: CertSubjectAlternativeNameType;
  value: string;
};

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
): string => {
  const foundAttr = subjectAttributes?.find((attr) => attr.type === type);
  return foundAttr?.value || "";
};
