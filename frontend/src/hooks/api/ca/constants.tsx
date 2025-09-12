import { AppConnection } from "../appConnections/enums";
import { SshCaStatus } from "../sshCa";
import { SshCertTemplateStatus } from "../sshCertificateTemplates";
import { AcmeDnsProvider, CaCapability, CaStatus, CaType, InternalCaType } from "./enums";

export const caTypeToNameMap: { [K in InternalCaType]: string } = {
  [InternalCaType.ROOT]: "Root",
  [InternalCaType.INTERMEDIATE]: "Intermediate"
};

export const caStatusToNameMap: { [K in CaStatus]: string } = {
  [CaStatus.ACTIVE]: "Active",
  [CaStatus.DISABLED]: "Disabled",
  [CaStatus.PENDING_CERTIFICATE]: "Pending Certificate"
};

export const ACME_DNS_PROVIDER_NAME_MAP: Record<AcmeDnsProvider, string> = {
  [AcmeDnsProvider.ROUTE53]: "Route53",
  [AcmeDnsProvider.Cloudflare]: "Cloudflare"
};

export const ACME_DNS_PROVIDER_APP_CONNECTION_MAP: Record<AcmeDnsProvider, AppConnection> = {
  [AcmeDnsProvider.ROUTE53]: AppConnection.AWS,
  [AcmeDnsProvider.Cloudflare]: AppConnection.Cloudflare
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
  [CaType.AZURE_AD_CS]: [CaCapability.ISSUE_CERTIFICATES, CaCapability.RENEW_CERTIFICATES]
};

/**
 * Check if a certificate authority type supports a specific capability
 */
export const caSupportsCapability = (caType: CaType, capability: CaCapability): boolean => {
  const capabilities = CA_TYPE_CAPABILITIES_MAP[caType] || [];
  return capabilities.includes(capability);
};

export const getCaStatusBadgeVariant = (status: CaStatus | SshCaStatus | SshCertTemplateStatus) => {
  switch (status) {
    case CaStatus.ACTIVE:
      return "success";
    case CaStatus.DISABLED:
      return "danger";
    default:
      return "primary";
  }
};
