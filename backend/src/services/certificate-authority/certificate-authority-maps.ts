import { CaCapability, CaType } from "./certificate-authority-enums";

export const CERTIFICATE_AUTHORITIES_TYPE_MAP: Record<CaType, string> = {
  [CaType.INTERNAL]: "Internal",
  [CaType.ACME]: "ACME-compatible CA",
  [CaType.AZURE_AD_CS]: "Active Directory Certificate Service",
  [CaType.AWS_PCA]: "AWS Private Certificate Authority"
};

export const CERTIFICATE_AUTHORITIES_CAPABILITIES_MAP: Record<CaType, CaCapability[]> = {
  [CaType.INTERNAL]: [
    CaCapability.ISSUE_CERTIFICATES,
    CaCapability.REVOKE_CERTIFICATES,
    CaCapability.RENEW_CERTIFICATES
  ],
  [CaType.ACME]: [CaCapability.ISSUE_CERTIFICATES, CaCapability.REVOKE_CERTIFICATES, CaCapability.RENEW_CERTIFICATES],
  [CaType.AZURE_AD_CS]: [
    CaCapability.ISSUE_CERTIFICATES,
    CaCapability.RENEW_CERTIFICATES
    // Note: REVOKE_CERTIFICATES intentionally omitted - not supported by ADCS connector
  ],
  [CaType.AWS_PCA]: [CaCapability.ISSUE_CERTIFICATES, CaCapability.REVOKE_CERTIFICATES, CaCapability.RENEW_CERTIFICATES]
};

/**
 * Check if a certificate authority type supports a specific capability
 */
export const caSupportsCapability = (caType: CaType, capability: CaCapability): boolean => {
  const capabilities = CERTIFICATE_AUTHORITIES_CAPABILITIES_MAP[caType] || [];
  return capabilities.includes(capability);
};
