import RE2 from "re2";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";

/**
 * AWS Secrets Manager naming constraints for secrets
 */
export const AWS_SECRETS_MANAGER_PKI_SYNC_CERTIFICATE_NAMING = {
  /**
   * Regular expression pattern for valid AWS Secrets Manager secret names
   * Must contain only alphanumeric characters, hyphens, and underscores
   * Must be 1-512 characters long
   */
  NAME_PATTERN: new RE2("^[\\w-]+$"),

  /**
   * String of characters that are forbidden in AWS Secrets Manager secret names
   */
  FORBIDDEN_CHARACTERS: " @#$%^&*()+=[]{}|;':\"<>?,./",

  /**
   * Minimum length for secret names in AWS Secrets Manager
   */
  MIN_LENGTH: 1,

  /**
   * Maximum length for secret names in AWS Secrets Manager
   */
  MAX_LENGTH: 512,

  /**
   * String representation of the allowed character pattern (for UI display)
   */
  ALLOWED_CHARACTER_PATTERN: "^[\\w-]+$"
} as const;

export const AWS_SECRETS_MANAGER_PKI_SYNC_DEFAULTS = {
  INFISICAL_PREFIX: "infisical-",
  DEFAULT_ENVIRONMENT: "production",
  DEFAULT_CERTIFICATE_NAME_SCHEMA: "infisical-{{certificateId}}",
  DEFAULT_FIELD_MAPPINGS: {
    certificate: "certificate",
    privateKey: "private_key",
    certificateChain: "certificate_chain",
    caCertificate: "ca_certificate"
  }
};

export const AWS_SECRETS_MANAGER_PKI_SYNC_OPTIONS = {
  DEFAULT_CAN_REMOVE_CERTIFICATES: true,
  DEFAULT_PRESERVE_SECRET_ON_RENEWAL: true,
  DEFAULT_UPDATE_EXISTING_CERTIFICATES: true,
  DEFAULT_CAN_IMPORT_CERTIFICATES: false
};

/**
 * AWS Secrets Manager PKI Sync list option configuration
 */
export const AWS_SECRETS_MANAGER_PKI_SYNC_LIST_OPTION = {
  name: "AWS Secrets Manager" as const,
  connection: AppConnection.AWS,
  destination: PkiSync.AwsSecretsManager,
  canImportCertificates: false,
  canRemoveCertificates: true,
  defaultCertificateNameSchema: "infisical-{{certificateId}}",
  forbiddenCharacters: AWS_SECRETS_MANAGER_PKI_SYNC_CERTIFICATE_NAMING.FORBIDDEN_CHARACTERS,
  allowedCharacterPattern: AWS_SECRETS_MANAGER_PKI_SYNC_CERTIFICATE_NAMING.ALLOWED_CHARACTER_PATTERN,
  maxCertificateNameLength: AWS_SECRETS_MANAGER_PKI_SYNC_CERTIFICATE_NAMING.MAX_LENGTH,
  minCertificateNameLength: AWS_SECRETS_MANAGER_PKI_SYNC_CERTIFICATE_NAMING.MIN_LENGTH
} as const;
