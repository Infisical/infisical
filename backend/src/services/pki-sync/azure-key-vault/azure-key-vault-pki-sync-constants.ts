import RE2 from "re2";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";

/**
 * Azure Key Vault naming constraints for certificates
 */
export const AZURE_KEY_VAULT_CERTIFICATE_NAMING = {
  /**
   * Regular expression pattern for valid Azure Key Vault certificate names
   * Must contain only alphanumeric characters and hyphens (a-z, A-Z, 0-9, -)
   * Must be 1-127 characters long
   */
  NAME_PATTERN: new RE2("^[a-zA-Z0-9-]{1,127}$"),

  /**
   * String of characters that are forbidden in Azure Key Vault certificate names
   */
  FORBIDDEN_CHARACTERS: "!@#$%^&*()+=[]{}|\\:;\"'<>,.?/~` _",

  /**
   * Maximum length for certificate names in Azure Key Vault
   */
  MAX_NAME_LENGTH: 127,

  /**
   * Minimum length for certificate names in Azure Key Vault
   */
  MIN_NAME_LENGTH: 1,

  /**
   * String representation of the allowed character pattern (for UI display)
   */
  ALLOWED_CHARACTER_PATTERN: "^[a-zA-Z0-9-]{1,127}$"
} as const;

/**
 * Azure Key Vault PKI Sync list option configuration
 */
export const AZURE_KEY_VAULT_PKI_SYNC_LIST_OPTION = {
  name: "Azure Key Vault" as const,
  connection: AppConnection.AzureKeyVault,
  destination: PkiSync.AzureKeyVault,
  canImportCertificates: false,
  canRemoveCertificates: false,
  defaultCertificateNameSchema: "Infisical-PKI-Sync-{{certificateId}}",
  forbiddenCharacters: AZURE_KEY_VAULT_CERTIFICATE_NAMING.FORBIDDEN_CHARACTERS,
  allowedCharacterPattern: AZURE_KEY_VAULT_CERTIFICATE_NAMING.ALLOWED_CHARACTER_PATTERN,
  maxCertificateNameLength: AZURE_KEY_VAULT_CERTIFICATE_NAMING.MAX_NAME_LENGTH,
  minCertificateNameLength: AZURE_KEY_VAULT_CERTIFICATE_NAMING.MIN_NAME_LENGTH
} as const;
