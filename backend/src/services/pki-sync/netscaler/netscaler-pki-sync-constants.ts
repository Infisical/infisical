import RE2 from "re2";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";

/**
 * NetScaler certificate naming constraints.
 * NetScaler certkey names can contain alphanumeric characters, hyphens, underscores, and periods.
 * NetScaler enforces a hard maximum of 63 characters on the certkey name (NITRO error 1106).
 */
export const NETSCALER_NAMING = {
  NAME_PATTERN: new RE2("^[a-zA-Z0-9._-]{1,63}$"),
  FORBIDDEN_CHARACTERS: "!@#$%^&*()+=[]{}|\\:;\"'<>,?/~` ",
  MAX_NAME_LENGTH: 63,
  MIN_NAME_LENGTH: 1,
  ALLOWED_CHARACTER_PATTERN: "^[a-zA-Z0-9._-]{1,63}$"
} as const;

export const NETSCALER_PKI_SYNC_LIST_OPTION = {
  name: "NetScaler" as const,
  connection: AppConnection.NetScaler,
  destination: PkiSync.NetScaler,
  canImportCertificates: false,
  canRemoveCertificates: true,
  defaultCertificateNameSchema: "Infisical-{{certificateId}}",
  forbiddenCharacters: NETSCALER_NAMING.FORBIDDEN_CHARACTERS,
  allowedCharacterPattern: NETSCALER_NAMING.ALLOWED_CHARACTER_PATTERN,
  maxCertificateNameLength: NETSCALER_NAMING.MAX_NAME_LENGTH,
  minCertificateNameLength: NETSCALER_NAMING.MIN_NAME_LENGTH
} as const;
