import { CharacterType, characterValidator } from "./validate-string";

/**
 * Windows/SMB validation utilities
 * Shared validation functions for SMB connections and Windows local account operations
 */

// Windows username validation: alphanumeric, underscores, hyphens, periods
// Used for both SMB connection admin users and Windows local account target users
export const validateWindowsUsername = characterValidator([
  CharacterType.AlphaNumeric,
  CharacterType.Hyphen,
  CharacterType.Underscore,
  CharacterType.Period
]);

// Hostname validation: alphanumeric, dots, hyphens
// Supports: hostnames (server.domain.com), IPv4 (192.168.1.1)
export const validateHostname = characterValidator([
  CharacterType.AlphaNumeric,
  CharacterType.Period,
  CharacterType.Hyphen
]);

// Domain validation: alphanumeric, dots, hyphens, underscores
export const validateDomain = characterValidator([
  CharacterType.AlphaNumeric,
  CharacterType.Period,
  CharacterType.Hyphen,
  CharacterType.Underscore
]);

// Dangerous characters that could enable command/RPC injection in Windows/SMB context
// These are blocked to prevent security issues:
// - Command separators: ; | &
// - Command substitution: ` $ ( )
// - Newlines: \n \r (auth file directive injection)
// - Null bytes: \0 (string termination attacks)
export const DANGEROUS_SMB_CHARS = [";", "|", "&", "`", "$", "(", ")", "\n", "\r", "\0"];

/**
 * Validate password doesn't contain dangerous SMB characters
 * Used for SMB connection passwords
 */
export const validateSmbPassword = (password: string): boolean => {
  return !DANGEROUS_SMB_CHARS.some((char) => password.includes(char));
};

/**
 * Check if string contains dangerous SMB characters
 * Used for validating allowedSymbols in password requirements
 */
export const containsDangerousSmbChars = (value: string): boolean => {
  return DANGEROUS_SMB_CHARS.some((char) => value.includes(char));
};

// Constants for field length limits
export const SMB_VALIDATION_LIMITS = {
  MAX_WINDOWS_USERNAME_LENGTH: 20,
  MAX_ADMIN_USERNAME_LENGTH: 104,
  MAX_HOST_LENGTH: 253,
  MAX_DOMAIN_LENGTH: 255
} as const;
