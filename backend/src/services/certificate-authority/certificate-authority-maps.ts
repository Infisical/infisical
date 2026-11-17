import { BadRequestError } from "@app/lib/errors";

import { CaCapability, CaType } from "./certificate-authority-enums";

export const CERTIFICATE_AUTHORITIES_TYPE_MAP: Record<CaType, string> = {
  [CaType.INTERNAL]: "Internal",
  [CaType.ACME]: "ACME-compatible CA",
  [CaType.AZURE_AD_CS]: "Active Directory Certificate Service",
  [CaType.ADCS]: "Microsoft ADCS",
  [CaType.AWS_PCA]: "AWS Private Certificate Authority",
  [CaType.DIGICERT]: "DigiCert",
  [CaType.AWS_ACM_PUBLIC_CA]: "AWS ACM Public CA",
  [CaType.VENAFI_TPP]: "Venafi Trust Protection Platform",
  [CaType.GODADDY]: "GoDaddy"
};

export const CERTIFICATE_AUTHORITIES_CAPABILITIES_MAP: Record<CaType, CaCapability[]> = {
  [CaType.INTERNAL]: [
    CaCapability.ISSUE_CERTIFICATES,
    CaCapability.REVOKE_CERTIFICATES,
    CaCapability.RENEW_CERTIFICATES,
    CaCapability.CUSTOM_EXTENSIONS
  ],
  [CaType.ACME]: [CaCapability.ISSUE_CERTIFICATES, CaCapability.REVOKE_CERTIFICATES, CaCapability.RENEW_CERTIFICATES],
  [CaType.AZURE_AD_CS]: [
    CaCapability.ISSUE_CERTIFICATES,
    CaCapability.RENEW_CERTIFICATES
    // Note: REVOKE_CERTIFICATES intentionally omitted - not supported by ADCS connector
  ],
  [CaType.ADCS]: [
    CaCapability.ISSUE_CERTIFICATES,
    CaCapability.REVOKE_CERTIFICATES,
    CaCapability.RENEW_CERTIFICATES,
    CaCapability.CUSTOM_EXTENSIONS
  ],
  [CaType.AWS_PCA]: [
    CaCapability.ISSUE_CERTIFICATES,
    CaCapability.REVOKE_CERTIFICATES,
    CaCapability.RENEW_CERTIFICATES,
    CaCapability.CUSTOM_EXTENSIONS
  ],
  [CaType.DIGICERT]: [
    CaCapability.ISSUE_CERTIFICATES,
    CaCapability.REVOKE_CERTIFICATES,
    CaCapability.RENEW_CERTIFICATES,
    CaCapability.REISSUE_CERTIFICATES
  ],
  [CaType.AWS_ACM_PUBLIC_CA]: [
    CaCapability.ISSUE_CERTIFICATES,
    CaCapability.REVOKE_CERTIFICATES,
    CaCapability.RENEW_CERTIFICATES
  ],
  [CaType.VENAFI_TPP]: [CaCapability.ISSUE_CERTIFICATES, CaCapability.RENEW_CERTIFICATES],
  [CaType.GODADDY]: [CaCapability.ISSUE_CERTIFICATES, CaCapability.REVOKE_CERTIFICATES, CaCapability.RENEW_CERTIFICATES]
};

/**
 * Check if a certificate authority type supports a specific capability
 */
// Whether a CA issues a certificate from a CSR it is handed. A Record, so a new CA type fails to compile
// until someone decides, because renewing on a key pair Infisical doesn't hold depends on it.
const CA_ISSUES_FROM_CSR: Record<CaType, boolean> = {
  [CaType.INTERNAL]: true,
  [CaType.ACME]: true,
  [CaType.AZURE_AD_CS]: true,
  [CaType.ADCS]: true,
  [CaType.AWS_PCA]: true,
  [CaType.DIGICERT]: true,
  [CaType.AWS_ACM_PUBLIC_CA]: false,
  [CaType.VENAFI_TPP]: true,
  [CaType.GODADDY]: true
};

export const caIssuesFromCsr = (caType: CaType): boolean => CA_ISSUES_FROM_CSR[caType];

export const caSupportsCapability = (caType: CaType, capability: CaCapability): boolean => {
  const capabilities = CERTIFICATE_AUTHORITIES_CAPABILITIES_MAP[caType] || [];
  return capabilities.includes(capability);
};

/**
 * Internal CAs sign inline; every other type places an order with an upstream CA asynchronously via
 * the certificate issuance queue. Exhaustive by type so a new CaType cannot be added without
 * choosing an issuance path — the direct and post-approval dispatches previously kept separate
 * inline lists and drifted apart.
 */
export const CERTIFICATE_AUTHORITIES_EXTERNAL_ISSUANCE_MAP: Record<CaType, boolean> = {
  [CaType.INTERNAL]: false,
  [CaType.ACME]: true,
  [CaType.AZURE_AD_CS]: true,
  [CaType.ADCS]: true,
  [CaType.AWS_PCA]: true,
  [CaType.DIGICERT]: true,
  [CaType.AWS_ACM_PUBLIC_CA]: true,
  [CaType.VENAFI_TPP]: true,
  [CaType.GODADDY]: true
};

export const caUsesExternalIssuanceQueue = (caType: CaType): boolean =>
  CERTIFICATE_AUTHORITIES_EXTERNAL_ISSUANCE_MAP[caType] ?? false;

export const assertCaSupportsCustomExtensions = (caType: CaType, count: number): void => {
  if (!count || caSupportsCapability(caType, CaCapability.CUSTOM_EXTENSIONS)) return;

  throw new BadRequestError({
    message: `${CERTIFICATE_AUTHORITIES_TYPE_MAP[caType] ?? caType} certificate authorities cannot carry custom extensions, but this request resolved ${count} of them. Update the certificate profile.`
  });
};
