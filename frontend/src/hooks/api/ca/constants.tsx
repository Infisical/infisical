import { AppConnection } from "../appConnections/enums";
import { CaCapability, CaDnsProvider, CaStatus, CaType, InternalCaType } from "./enums";

export const caTypeToNameMap: { [K in InternalCaType]: string } = {
  [InternalCaType.ROOT]: "Root",
  [InternalCaType.INTERMEDIATE]: "Intermediate"
};

export const caStatusToNameMap: { [K in CaStatus]: string } = {
  [CaStatus.ACTIVE]: "Active",
  [CaStatus.DISABLED]: "Disabled",
  [CaStatus.PENDING_CERTIFICATE]: "Pending Certificate"
};

export const CA_DNS_PROVIDER_NAME_MAP: Record<CaDnsProvider, string> = {
  [CaDnsProvider.ROUTE53]: "Route53",
  [CaDnsProvider.Cloudflare]: "Cloudflare",
  [CaDnsProvider.DNSMadeEasy]: "DNS Made Easy",
  [CaDnsProvider.AzureDNS]: "Azure DNS"
};

export const CA_DNS_PROVIDER_APP_CONNECTION_MAP: Record<CaDnsProvider, AppConnection> = {
  [CaDnsProvider.ROUTE53]: AppConnection.AWS,
  [CaDnsProvider.Cloudflare]: AppConnection.Cloudflare,
  [CaDnsProvider.DNSMadeEasy]: AppConnection.DNSMadeEasy,
  [CaDnsProvider.AzureDNS]: AppConnection.AzureDNS
};

export const CA_TYPE_CAPABILITIES_MAP: Record<CaType, CaCapability[]> = {
  [CaType.INTERNAL]: [
    CaCapability.ISSUE_CERTIFICATES,
    CaCapability.REVOKE_CERTIFICATES,
    CaCapability.RENEW_CERTIFICATES
  ],
  [CaType.ACME]: [
    CaCapability.ISSUE_CERTIFICATES,
    CaCapability.REVOKE_CERTIFICATES,
    CaCapability.RENEW_CERTIFICATES
  ],
  [CaType.AZURE_AD_CS]: [CaCapability.ISSUE_CERTIFICATES, CaCapability.RENEW_CERTIFICATES],
  [CaType.ADCS]: [
    CaCapability.ISSUE_CERTIFICATES,
    CaCapability.REVOKE_CERTIFICATES,
    CaCapability.RENEW_CERTIFICATES
  ],
  [CaType.AWS_PCA]: [
    CaCapability.ISSUE_CERTIFICATES,
    CaCapability.REVOKE_CERTIFICATES,
    CaCapability.RENEW_CERTIFICATES
  ],
  [CaType.DIGICERT]: [
    CaCapability.ISSUE_CERTIFICATES,
    CaCapability.REVOKE_CERTIFICATES,
    CaCapability.RENEW_CERTIFICATES
  ],
  [CaType.AWS_ACM_PUBLIC_CA]: [
    CaCapability.ISSUE_CERTIFICATES,
    CaCapability.REVOKE_CERTIFICATES,
    CaCapability.RENEW_CERTIFICATES
  ],
  [CaType.VENAFI_TPP]: [CaCapability.ISSUE_CERTIFICATES, CaCapability.RENEW_CERTIFICATES],
  [CaType.GODADDY]: [
    CaCapability.ISSUE_CERTIFICATES,
    CaCapability.REVOKE_CERTIFICATES,
    CaCapability.RENEW_CERTIFICATES
  ]
};

export const EXTERNAL_CA_TYPE_NAME_MAP: Record<string, string> = {
  [CaType.ACME]: "ACME",
  [CaType.AZURE_AD_CS]: "Azure ADCS (Web Enrollment)",
  [CaType.ADCS]: "Microsoft ADCS",
  [CaType.AWS_PCA]: "AWS Private CA (PCA)",
  [CaType.DIGICERT]: "DigiCert CertCentral",
  [CaType.AWS_ACM_PUBLIC_CA]: "AWS ACM Public CA",
  [CaType.VENAFI_TPP]: "Venafi TPP",
  [CaType.GODADDY]: "GoDaddy"
};

/**
 * Check if a certificate authority type supports a specific capability
 */
export const caSupportsCapability = (caType: CaType, capability: CaCapability): boolean => {
  const capabilities = CA_TYPE_CAPABILITIES_MAP[caType] || [];
  return capabilities.includes(capability);
};

export const getCaStatusBadgeVariant = (status: CaStatus) => {
  switch (status) {
    case CaStatus.ACTIVE:
      return "success";
    case CaStatus.DISABLED:
      return "danger";
    default:
      return "warning";
  }
};
