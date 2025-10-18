import { CertSubjectAlternativeNameType } from "@app/pages/cert-manager/PoliciesPage/components/CertificateTemplatesV2Tab/shared/certificate-constants";

export enum FrontendSanType {
  DNS = "dns",
  IP = "ip",
  EMAIL = "email",
  URI = "uri"
}

export const mapBackendSanTypeToFrontend = (backendType: string): FrontendSanType => {
  switch (backendType) {
    case CertSubjectAlternativeNameType.DNS_NAME:
      return FrontendSanType.DNS;
    case CertSubjectAlternativeNameType.IP_ADDRESS:
      return FrontendSanType.IP;
    case CertSubjectAlternativeNameType.EMAIL:
      return FrontendSanType.EMAIL;
    case CertSubjectAlternativeNameType.URI:
      return FrontendSanType.URI;
    default:
      return backendType as FrontendSanType;
  }
};

export const mapFrontendSanTypeToBackend = (frontendType: FrontendSanType): string => {
  switch (frontendType) {
    case FrontendSanType.DNS:
      return CertSubjectAlternativeNameType.DNS_NAME;
    case FrontendSanType.IP:
      return CertSubjectAlternativeNameType.IP_ADDRESS;
    case FrontendSanType.EMAIL:
      return CertSubjectAlternativeNameType.EMAIL;
    case FrontendSanType.URI:
      return CertSubjectAlternativeNameType.URI;
    default:
      return frontendType;
  }
};

export const getSanPlaceholder = (sanType: FrontendSanType): string => {
  switch (sanType) {
    case FrontendSanType.DNS:
      return "example.com or *.example.com";
    case FrontendSanType.IP:
      return "192.168.1.1";
    case FrontendSanType.EMAIL:
      return "admin@example.com";
    case FrontendSanType.URI:
      return "https://example.com";
    default:
      return "Enter value";
  }
};

export const getSanTypeLabels = () => ({
  [FrontendSanType.DNS]: "DNS",
  [FrontendSanType.IP]: "IP",
  [FrontendSanType.EMAIL]: "Email",
  [FrontendSanType.URI]: "URI"
});

export type SubjectAltName = {
  type: FrontendSanType;
  value: string;
};

export const formatSubjectAltNames = (subjectAltNames: SubjectAltName[]) => {
  return subjectAltNames
    .filter((san) => san.value.trim())
    .map((san) => ({
      type: mapFrontendSanTypeToBackend(san.type),
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
