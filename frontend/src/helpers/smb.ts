/**
 * Windows/SMB validation utilities
 * Shared validation functions for SMB connections and Windows local account operations
 * These must stay in sync with backend/src/lib/validator/validate-smb.ts
 */

// Regex patterns for character validation
// Hostname: alphanumeric, dots, hyphens
export const SMB_HOSTNAME_REGEX = /^[a-zA-Z0-9.-]+$/;

// Domain: alphanumeric, dots, hyphens, underscores
export const SMB_DOMAIN_REGEX = /^[a-zA-Z0-9._-]+$/;

// Windows username: alphanumeric, underscores, hyphens, periods
// First character must be alphanumeric or underscore (no hyphen or period)
export const SMB_USERNAME_REGEX = /^[a-zA-Z0-9_][a-zA-Z0-9._-]*$/;

// Dangerous characters that could enable command/RPC injection in Windows/SMB context
// These are blocked to prevent security issues:
// - Command separators: ; | &
// - Command substitution: ` $ ( )
// - Newlines: \n \r (auth file directive injection)
// - Null bytes: \0 (string termination attacks)
export const DANGEROUS_SMB_CHARS = [";", "|", "&", "`", "$", "(", ")", "\n", "\r", "\0"];

/**
 * Validate password doesn't contain dangerous SMB characters
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

// Constants for field length limits (must match backend)
export const SMB_VALIDATION_LIMITS = {
  MAX_WINDOWS_USERNAME_LENGTH: 20,
  MAX_ADMIN_USERNAME_LENGTH: 104,
  MAX_HOST_LENGTH: 253,
  MAX_DOMAIN_LENGTH: 255
} as const;
