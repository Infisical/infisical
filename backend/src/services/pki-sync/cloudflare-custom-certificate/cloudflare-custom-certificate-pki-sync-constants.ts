import RE2 from "re2";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";

/**
 * Cloudflare Custom Certificate naming constraints for certificates
 */
export const CLOUDFLARE_CUSTOM_CERTIFICATE_NAMING = {
  /**
   * Regular expression pattern for valid Cloudflare certificate names
   * Certificate names can contain alphanumeric characters, hyphens, and underscores
   * Must be 1-255 characters long
   */
  NAME_PATTERN: new RE2("^[a-zA-Z0-9-_]{1,255}$"),

  /**
   * String of characters that are forbidden in Cloudflare certificate names
   */
  FORBIDDEN_CHARACTERS: "!@#$%^&*()+=[]{}|\\:;\"'<>,.?/~` ",

  /**
   * Maximum length for certificate names
   */
  MAX_NAME_LENGTH: 255,

  /**
   * Minimum length for certificate names
   */
  MIN_NAME_LENGTH: 1,

  /**
   * String representation of the allowed character pattern (for UI display)
   */
  ALLOWED_CHARACTER_PATTERN: "^[a-zA-Z0-9-_]{1,255}$"
} as const;

/**
 * Cloudflare Custom Certificate PKI Sync list option configuration
 */
export const CLOUDFLARE_CUSTOM_CERTIFICATE_PKI_SYNC_LIST_OPTION = {
  name: "Cloudflare Custom SSL Certificate" as const,
  connection: AppConnection.Cloudflare,
  destination: PkiSync.CloudflareCustomCertificate,
  canImportCertificates: false,
  canRemoveCertificates: true,
  defaultCertificateNameSchema: "Infisical-{{certificateId}}",
  forbiddenCharacters: CLOUDFLARE_CUSTOM_CERTIFICATE_NAMING.FORBIDDEN_CHARACTERS,
  allowedCharacterPattern: CLOUDFLARE_CUSTOM_CERTIFICATE_NAMING.ALLOWED_CHARACTER_PATTERN,
  maxCertificateNameLength: CLOUDFLARE_CUSTOM_CERTIFICATE_NAMING.MAX_NAME_LENGTH,
  minCertificateNameLength: CLOUDFLARE_CUSTOM_CERTIFICATE_NAMING.MIN_NAME_LENGTH
} as const;
