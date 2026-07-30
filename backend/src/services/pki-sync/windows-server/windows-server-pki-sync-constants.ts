import RE2 from "re2";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";

/**
 * Windows Server file-name constraints. The certificate name schema produces the file's base name
 * (the export format appends the extension). The base must be a single path segment, so path
 * separators, traversal, and characters Windows forbids in file names are disallowed.
 */
export const WINDOWS_SERVER_NAMING = {
  NAME_PATTERN: new RE2("^[a-zA-Z0-9._-]{1,200}$"),
  FORBIDDEN_CHARACTERS: '/\\\0:*?"<>|',
  MAX_NAME_LENGTH: 200,
  MIN_NAME_LENGTH: 1,
  ALLOWED_CHARACTER_PATTERN: "^[a-zA-Z0-9._-]{1,200}$"
} as const;

export const WINDOWS_SERVER_PKI_SYNC_LIST_OPTION = {
  name: "Windows Server" as const,
  connection: AppConnection.WinRM,
  destination: PkiSync.WindowsServer,
  canImportCertificates: false,
  canRemoveCertificates: true,
  defaultCertificateNameSchema: "{{commonName}}",
  forbiddenCharacters: WINDOWS_SERVER_NAMING.FORBIDDEN_CHARACTERS,
  allowedCharacterPattern: WINDOWS_SERVER_NAMING.ALLOWED_CHARACTER_PATTERN,
  maxCertificateNameLength: WINDOWS_SERVER_NAMING.MAX_NAME_LENGTH,
  minCertificateNameLength: WINDOWS_SERVER_NAMING.MIN_NAME_LENGTH
} as const;
