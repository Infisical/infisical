import RE2 from "re2";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";

export enum F5BigIpProfileType {
  None = "none",
  ClientSsl = "client-ssl",
  ServerSsl = "server-ssl"
}

/**
 * F5 BIG-IP certificate naming constraints.
 * F5 BIG-IP TMOS object names accept alphanumeric characters, hyphens, underscores, and periods.
 * Names are limited to 255 characters and may not contain spaces or shell-sensitive characters.
 */
export const F5_BIG_IP_NAMING = {
  NAME_PATTERN: new RE2("^[a-zA-Z0-9._-]{1,255}$"),
  FORBIDDEN_CHARACTERS: "!@#$%^&*()+=[]{}|\\:;\"'<>,?/~` ",
  MAX_NAME_LENGTH: 255,
  MIN_NAME_LENGTH: 1,
  ALLOWED_CHARACTER_PATTERN: "^[a-zA-Z0-9._-]{1,255}$"
} as const;

export const F5_BIG_IP_DEFAULT_PARTITION = "Common";

export const F5_BIG_IP_PKI_SYNC_LIST_OPTION = {
  name: "F5 BIG-IP" as const,
  connection: AppConnection.F5BigIp,
  destination: PkiSync.F5BigIp,
  canImportCertificates: false,
  canRemoveCertificates: true,
  defaultCertificateNameSchema: "Infisical-{{certificateId}}",
  forbiddenCharacters: F5_BIG_IP_NAMING.FORBIDDEN_CHARACTERS,
  allowedCharacterPattern: F5_BIG_IP_NAMING.ALLOWED_CHARACTER_PATTERN,
  maxCertificateNameLength: F5_BIG_IP_NAMING.MAX_NAME_LENGTH,
  minCertificateNameLength: F5_BIG_IP_NAMING.MIN_NAME_LENGTH
} as const;
