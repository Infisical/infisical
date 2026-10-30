import RE2 from "re2";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";

const ALLOWED_CHARACTER_PATTERN = "^[a-zA-Z0-9_-]{1,31}$";

export const PALO_ALTO_NETWORKS_NAMING = {
  NAME_PATTERN: new RE2(ALLOWED_CHARACTER_PATTERN),
  FORBIDDEN_CHARACTERS: "!@#$%^&*()+=[]{}|\\:;\"'<>,.?/~` ",
  MAX_NAME_LENGTH: 31,
  MIN_NAME_LENGTH: 1,
  ALLOWED_CHARACTER_PATTERN
} as const;

export const PALO_ALTO_NETWORKS_CA_CERTIFICATE_PREFIX = "INF-CA-";

export const PALO_ALTO_NETWORKS_PKI_SYNC_DESTINATIONS = [
  PkiSync.PaloAltoNetworks,
  PkiSync.PaloAltoNetworksSslTlsProfile
];

const PALO_ALTO_NETWORKS_SHARED_LIST_OPTION = {
  connection: AppConnection.PaloAltoNetworks,
  canImportCertificates: false,
  canRemoveCertificates: true,
  canRunPostSyncCommand: false,
  canRunHealthCheckCommand: false,
  defaultCertificateNameSchema: "INF-{{shortCertificateId}}",
  forbiddenCharacters: PALO_ALTO_NETWORKS_NAMING.FORBIDDEN_CHARACTERS,
  allowedCharacterPattern: PALO_ALTO_NETWORKS_NAMING.ALLOWED_CHARACTER_PATTERN,
  maxCertificateNameLength: PALO_ALTO_NETWORKS_NAMING.MAX_NAME_LENGTH,
  minCertificateNameLength: PALO_ALTO_NETWORKS_NAMING.MIN_NAME_LENGTH
} as const;

export const PALO_ALTO_NETWORKS_PKI_SYNC_LIST_OPTION = {
  ...PALO_ALTO_NETWORKS_SHARED_LIST_OPTION,
  name: "Palo Alto Networks" as const,
  destination: PkiSync.PaloAltoNetworks
} as const;

export const PALO_ALTO_NETWORKS_SSL_TLS_PROFILE_PKI_SYNC_LIST_OPTION = {
  ...PALO_ALTO_NETWORKS_SHARED_LIST_OPTION,
  name: "Palo Alto Networks SSL/TLS Profile" as const,
  destination: PkiSync.PaloAltoNetworksSslTlsProfile,
  maxCertificates: 1
} as const;
