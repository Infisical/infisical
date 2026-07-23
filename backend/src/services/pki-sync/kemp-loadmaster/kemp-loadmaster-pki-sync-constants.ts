import RE2 from "re2";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";

// The LoadMaster stores each cert as `<name>.pem`, so the identifier limit is 251 chars (255 filesystem
// name limit minus ".pem")
const KEMP_LOADMASTER_NAME_REGEX_SOURCE = "^[a-zA-Z0-9._-]{1,251}$";

export const KEMP_LOADMASTER_NAMING = {
  NAME_PATTERN: new RE2(KEMP_LOADMASTER_NAME_REGEX_SOURCE),
  FORBIDDEN_CHARACTERS: "!@#$%^&*()+=[]{}|\\:;\"'<>,?/~` ",
  MAX_NAME_LENGTH: 251,
  MIN_NAME_LENGTH: 1,
  ALLOWED_CHARACTER_PATTERN: KEMP_LOADMASTER_NAME_REGEX_SOURCE
} as const;

export const KEMP_LOADMASTER_DEFAULT_CA_NAME_SCHEMA = "Infisical-ca-{{fingerprint}}";

export const KEMP_LOADMASTER_PKI_SYNC_LIST_OPTION = {
  name: "Kemp LoadMaster" as const,
  connection: AppConnection.KempLoadMaster,
  destination: PkiSync.KempLoadMaster,
  canImportCertificates: false,
  canRemoveCertificates: true,
  defaultCertificateNameSchema: "Infisical-{{certificateId}}",
  forbiddenCharacters: KEMP_LOADMASTER_NAMING.FORBIDDEN_CHARACTERS,
  allowedCharacterPattern: KEMP_LOADMASTER_NAMING.ALLOWED_CHARACTER_PATTERN,
  maxCertificateNameLength: KEMP_LOADMASTER_NAMING.MAX_NAME_LENGTH,
  minCertificateNameLength: KEMP_LOADMASTER_NAMING.MIN_NAME_LENGTH
} as const;
