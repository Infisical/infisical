import RE2 from "re2";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";

/**
 * AWS Certificate Manager naming constraints for certificates
 */
export const AWS_CERTIFICATE_MANAGER_CERTIFICATE_NAMING = {
  /**
   * Regular expression pattern for valid AWS Certificate Manager certificate names
   * Must contain only alphanumeric characters, spaces, hyphens, and underscores
   * Must be 1-256 characters long
   */
  NAME_PATTERN: new RE2("^[a-zA-Z0-9\\s\\-_]{1,256}$"),

  /**
   * String of characters that are forbidden in AWS Certificate Manager certificate names
   */
  FORBIDDEN_CHARACTERS: "!@#$%^&*()+={}[]|\\:;\"'<>,.?/~`",

  /**
   * Maximum length for certificate names in AWS Certificate Manager
   */
  MAX_LENGTH: 256,

  /**
   * Minimum length for certificate names in AWS Certificate Manager
   */
  MIN_LENGTH: 1,

  /**
   * String representation of the allowed character pattern (for UI display)
   */
  ALLOWED_CHARACTER_PATTERN: "^[a-zA-Z0-9\\s\\-_]{1,256}$"
} as const;

/**
 * AWS Certificate Manager PKI Sync list option configuration
 */
export const AWS_CERTIFICATE_MANAGER_PKI_SYNC_LIST_OPTION = {
  name: "AWS Certificate Manager" as const,
  connection: AppConnection.AWS,
  destination: PkiSync.AwsCertificateManager,
  canImportCertificates: false,
  canRemoveCertificates: true,
  defaultCertificateNameSchema: "Infisical-{{certificateId}}",
  forbiddenCharacters: AWS_CERTIFICATE_MANAGER_CERTIFICATE_NAMING.FORBIDDEN_CHARACTERS,
  allowedCharacterPattern: AWS_CERTIFICATE_MANAGER_CERTIFICATE_NAMING.ALLOWED_CHARACTER_PATTERN,
  maxCertificateNameLength: AWS_CERTIFICATE_MANAGER_CERTIFICATE_NAMING.MAX_LENGTH,
  minCertificateNameLength: AWS_CERTIFICATE_MANAGER_CERTIFICATE_NAMING.MIN_LENGTH
} as const;
