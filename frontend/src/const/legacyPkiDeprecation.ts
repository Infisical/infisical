// keep in sync with backend/src/services/legacy-pki-deprecation/legacy-pki-deprecation-queue.ts
export const LEGACY_PKI_DEPRECATION_DATE = "December 15, 2026";

export enum LegacyPkiResource {
  CertificateTemplate = "certificate_template",
  PkiSubscriber = "pki_subscriber"
}
