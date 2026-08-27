import RE2 from "re2";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { RateLimitConfig } from "@app/services/connection-queue";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";

import { GcpCertificateManagerAction, GcpCertificateManagerScope } from "./gcp-certificate-manager-pki-sync-enums";

const GCP_CERTIFICATE_MANAGER_NAME_REGEX_SOURCE = "^[a-z][a-z0-9-]{0,62}$";

export const GCP_CERTIFICATE_MANAGER_NAMING = {
  NAME_PATTERN: new RE2(GCP_CERTIFICATE_MANAGER_NAME_REGEX_SOURCE),
  FORBIDDEN_CHARACTERS: "!@#$%^&*()+=[]{}|\\:;\"'<>,.?/~`_ ",
  MAX_NAME_LENGTH: 63,
  MIN_NAME_LENGTH: 1,
  ALLOWED_CHARACTER_PATTERN: GCP_CERTIFICATE_MANAGER_NAME_REGEX_SOURCE
} as const;

export const GCP_SCOPE_API_VALUES: Record<GcpCertificateManagerScope, string> = {
  [GcpCertificateManagerScope.Default]: "DEFAULT",
  [GcpCertificateManagerScope.EdgeCache]: "EDGE_CACHE",
  [GcpCertificateManagerScope.AllRegions]: "ALL_REGIONS",
  [GcpCertificateManagerScope.ClientAuth]: "CLIENT_AUTH"
};

export const GCP_PRIMARY_MATCHER = "PRIMARY";

export const GCP_MAX_CERTIFICATES_PER_MAP_ENTRY = 4;

export const GCP_NAME_HASH_LENGTH = 8;

export const GCP_MAX_LIST_PAGES = 20;

export const GCP_NAME_LEADING_LETTER_PATTERN = new RE2("^[a-z]");

export const GCP_LOCATION_PATTERN = new RE2("^[a-z0-9-]{1,32}$");

export const GCP_CERTIFICATE_MAP_NAME_PATTERN = new RE2(GCP_CERTIFICATE_MANAGER_NAME_REGEX_SOURCE);

export const GCP_HOSTNAME_PATTERN = new RE2("^(\\*\\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$", "i");

export const GCP_CERTIFICATE_MANAGER_SUPPORTED_KEY_ALGORITHMS = [
  "RSA-2048",
  "RSA-3072",
  "RSA-4096",
  "ECDSA-P256",
  "ECDSA-P384"
] as const;

// GCP allows 64 labels per resource and the sync writes two of its own.
export const GCP_MAX_USER_LABELS = 62;

export const GCP_LABEL_KEY_PATTERN = new RE2("^[a-z][a-z0-9_-]{0,62}$");
export const GCP_LABEL_VALUE_PATTERN = new RE2("^[a-z0-9_-]{0,63}$");

export const GCP_MANAGED_BY_LABEL_KEY = "managed-by";
export const GCP_MANAGED_BY_LABEL_VALUE = "infisical";
export const GCP_CERTIFICATE_ID_LABEL_KEY = "infisical-certificate-id";

export const GCP_RESERVED_LABEL_KEYS = [GCP_MANAGED_BY_LABEL_KEY, GCP_CERTIFICATE_ID_LABEL_KEY] as const;

// Certificate Manager allows 300 write requests per minute per project.
export const GCP_RATE_LIMIT_CONFIG: RateLimitConfig = {
  MAX_CONCURRENT_REQUESTS: 5,
  BASE_DELAY: 1000,
  MAX_DELAY: 30000,
  MAX_RETRIES: 3,
  RATE_LIMIT_STATUS_CODES: [429, 503]
};

export const GCP_OPERATION_POLL_TIMEOUT_MS = 120_000;
export const GCP_OPERATION_POLL_BASE_DELAY_MS = 1000;
export const GCP_OPERATION_POLL_MAX_DELAY_MS = 5000;

export const GCP_CERTIFICATE_MANAGER_PKI_SYNC_LIST_OPTION = {
  name: "GCP Certificate Manager" as const,
  connection: AppConnection.GCP,
  destination: PkiSync.GcpCertificateManager,
  canImportCertificates: false,
  canRemoveCertificates: true,
  canRunPostSyncCommand: false,
  defaultCertificateNameSchema: "infisical-{{certificateId}}",
  forbiddenCharacters: GCP_CERTIFICATE_MANAGER_NAMING.FORBIDDEN_CHARACTERS,
  allowedCharacterPattern: GCP_CERTIFICATE_MANAGER_NAMING.ALLOWED_CHARACTER_PATTERN,
  maxCertificateNameLength: GCP_CERTIFICATE_MANAGER_NAMING.MAX_NAME_LENGTH,
  minCertificateNameLength: GCP_CERTIFICATE_MANAGER_NAMING.MIN_NAME_LENGTH
} as const;

export const gcpCertificatePermission = (action: GcpCertificateManagerAction) => `certificatemanager.certs.${action}`;
export const gcpCertificateMapPermission = (action: GcpCertificateManagerAction) =>
  `certificatemanager.certmaps.${action}`;
export const gcpCertificateMapEntryPermission = (action: GcpCertificateManagerAction) =>
  `certificatemanager.certmapentries.${action}`;
